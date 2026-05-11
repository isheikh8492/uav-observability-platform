import type dgram from "node:dgram";
import type {
  CommandKind,
  InflightCommand,
  VehicleId,
  VehiclePayload,
} from "@uav/types";

import { MavLinkCommander } from "../mavlink/commander.js";
import { TelemetryStore } from "../state/store.js";
import { DroneStateMachine } from "../state/droneStateMachine.js";
import type { DecoderUpdate } from "../mavlink/decoder.js";
import { logger } from "../util/logger.js";

/** Thrown when a command arrives while another command is still processing. */
export class VehicleBusyError extends Error {
  readonly code = "VEHICLE_BUSY";
  constructor(public readonly inflight: InflightCommand) {
    super(`Vehicle busy: ${inflight.kind} in progress (started ${Date.now() - inflight.sentAt}ms ago)`);
  }
}

/**
 * A session for a single vehicle.
 *
 * Owns the per-vehicle state: telemetry accumulator, commander, FSM.
 * MAVLink events flow in through `apply*` methods; commands flow out
 * via `executeCommand`. State changes notify subscribers, but the
 * broadcast loop in index.ts polls at a steady rate — keeps things simple.
 */
export class VehicleSession {
  readonly vehicleId: VehicleId;
  readonly name: string;

  private readonly store: TelemetryStore;
  private readonly commander: MavLinkCommander;
  private readonly fsm: DroneStateMachine;
  private readonly connectionTimeoutMs: number;

  /**
   * Currently-processing command. Concurrent submissions are rejected with
   * VehicleBusyError until this clears. Broadcast in the vehicle payload so
   * all operators see "X command in progress."
   */
  private inflight: InflightCommand | null = null;

  constructor(opts: {
    vehicleId: VehicleId;
    name: string;
    socket: dgram.Socket;
    targetHost: string;
    targetPort: number;
    connectionTimeoutMs: number;
  }) {
    this.vehicleId = opts.vehicleId;
    this.name = opts.name;
    this.store = new TelemetryStore();
    this.fsm = new DroneStateMachine();
    this.connectionTimeoutMs = opts.connectionTimeoutMs;
    this.commander = new MavLinkCommander({
      socket: opts.socket,
      targetHost: opts.targetHost,
      targetPort: opts.targetPort,
      store: this.store,
    });
  }

  // ─── Inbound: MAVLink event handlers ──────────────────────────────────────

  applyTelemetry(update: DecoderUpdate): void {
    this.store.applyUpdate(update);
    this.fsm.handle({ type: "telemetry", snapshot: this.store.snapshot() });
  }

  recordHeartbeat(): void {
    this.store.recordHeartbeat();
    this.fsm.handle({ type: "telemetry", snapshot: this.store.snapshot() });
  }

  applyCommandAck(cmd: number, result: number): void {
    this.fsm.handle({ type: "command_ack", cmd, result });
  }

  applyStatusText(severity: number, text: string): void {
    this.fsm.handle({ type: "status_text", severity, text });
  }

  // ─── Outbound: command execution ──────────────────────────────────────────

  /**
   * Execute a command on this vehicle.
   *
   * Per-vehicle serialization: only one command processes at a time. Concurrent
   * submissions throw `VehicleBusyError` immediately — caller should surface
   * this so the operator knows another command is in progress.
   *
   * @param sessionId identifies which WS session sent the command (audit/visibility)
   */
  async executeCommand(
    kind: CommandKind,
    params: Record<string, number> | undefined,
    sessionId: string,
  ): Promise<void> {
    if (this.inflight) {
      throw new VehicleBusyError(this.inflight);
    }
    this.inflight = { kind, sentAt: Date.now(), sessionId };

    // Feed the FSM the intent BEFORE sending — UX wants immediate state hints
    // (e.g., "arming…" right after click, before PX4's heartbeat reflects it).
    this.fsm.handle({ type: "command_sent", kind, params });
    logger.info(
      `[vehicle ${this.vehicleId}] [session ${sessionId}] executing ${kind}`,
      params ?? {}
    );

    try {
      await this.commander.execute(kind, params ?? {});
    } catch (err) {
      logger.error(
        `[vehicle ${this.vehicleId}] [session ${sessionId}] command ${kind} failed:`,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    } finally {
      this.inflight = null;
    }
  }

  /** Returns the inflight command for broadcasting (read-only view). */
  inflightCommand(): InflightCommand | null {
    return this.inflight;
  }

  // ─── Periodic ─────────────────────────────────────────────────────────────

  /** Called by the broadcast loop — drives time-based transitions (timeouts). */
  tick(): void {
    this.fsm.handle({ type: "tick", now: Date.now() });
  }

  // ─── Snapshot for broadcasting ────────────────────────────────────────────

  payload(): VehiclePayload {
    return {
      vehicleId: this.vehicleId,
      name: this.name,
      snapshot: this.store.snapshot(),
      state: this.fsm.current(),
      connection: this.store.connectionStatus(this.connectionTimeoutMs),
      inflightCommand: this.inflight,
    };
  }
}
