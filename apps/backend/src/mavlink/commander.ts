import type dgram from "node:dgram";
import {
  MavLinkProtocolV2,
  send,
} from "node-mavlink";
import { common } from "node-mavlink";
import type { CommandKind } from "@uav/types";

import type { TelemetryStore } from "../state/store.js";
import { logger } from "../util/logger.js";

const { CommandLong, MavCmd } = common;

/**
 * Sends MAVLink commands to PX4 over the existing UDP socket.
 *
 * Uses the same socket that's receiving telemetry — UDP is bidirectional,
 * so writes go back to PX4 at its listening port (18570).
 *
 * Commands map from app-level CommandKind to MAV_CMD_* values:
 *   arm/disarm  → MAV_CMD_COMPONENT_ARM_DISARM (400)
 *   takeoff     → MAV_CMD_NAV_TAKEOFF (22)
 *   land        → MAV_CMD_NAV_LAND (21)
 *   rtl, hold   → MAV_CMD_DO_SET_MODE (176) with PX4-specific mode encoding
 */
export class MavLinkCommander {
  private socket: dgram.Socket;
  private targetHost: string;
  private targetPort: number;
  private protocol: MavLinkProtocolV2;
  private writableAdapter: { write(chunk: Buffer, ...rest: unknown[]): boolean };

  // GCS identification — must match what PX4 sees as our heartbeat source
  private readonly gcsSystemId = 255;
  private readonly gcsComponentId = 190; // MISSIONPLANNER

  // PX4 is typically system 1, autopilot component is 1
  private readonly vehicleSystemId = 1;
  private readonly vehicleComponentId = 1;

  private store: TelemetryStore;

  constructor(opts: {
    socket: dgram.Socket;
    targetHost: string;
    targetPort: number;
    store: TelemetryStore;
  }) {
    this.socket = opts.socket;
    this.targetHost = opts.targetHost;
    this.targetPort = opts.targetPort;
    this.store = opts.store;
    this.protocol = new MavLinkProtocolV2(this.gcsSystemId, this.gcsComponentId);

    // Node writable streams accept either:
    //   write(chunk, callback)              ← node-mavlink uses this form
    //   write(chunk, encoding, callback)
    // We normalize: if the 2nd arg is a function, it's the callback.
    this.writableAdapter = {
      write: (chunk, encOrCb?: unknown, maybeCb?: () => void) => {
        const cb = typeof encOrCb === "function" ? (encOrCb as () => void) : maybeCb;
        this.socket.send(chunk, this.targetPort, this.targetHost, () => cb?.());
        return true;
      },
    };
  }

  /**
   * Send a high-level command. Returns when the bytes have been flushed
   * to the network (NOT when the vehicle has acknowledged).
   */
  async execute(kind: CommandKind, params: Record<string, number> = {}): Promise<void> {
    const cmd = this.buildCommand(kind, params);
    if (!cmd) {
      throw new Error(`Unsupported command: ${kind}`);
    }
    await send(this.writableAdapter as never, cmd, this.protocol);
    logger.info(`[commander] sent ${kind}`, params);
  }

  /**
   * Build a CommandLong message from a high-level command kind.
   * Returns null if the command kind is unrecognized.
   */
  private buildCommand(kind: CommandKind, params: Record<string, number>): InstanceType<typeof CommandLong> | null {
    const cmd = new CommandLong();
    cmd.targetSystem = this.vehicleSystemId;
    cmd.targetComponent = this.vehicleComponentId;
    cmd.confirmation = 0;

    // PX4 custom_mode encoding for DO_SET_MODE:
    //   param1 = MAV_MODE_FLAG_CUSTOM_MODE_ENABLED (1)
    //   param2 = PX4 main mode (4 = AUTO)
    //   param3 = PX4 sub mode (3 = LOITER, 5 = RTL)
    const PX4_MAIN_AUTO = 4;
    const PX4_AUTO_LOITER = 3;
    const PX4_AUTO_RTL = 5;
    const CUSTOM_MODE_ENABLED = 1;

    switch (kind) {
      case "arm":
        cmd.command = MavCmd.COMPONENT_ARM_DISARM;
        cmd._param1 = 1; // arm
        cmd._param2 = 0; // do not force
        break;
      case "disarm":
        cmd.command = MavCmd.COMPONENT_ARM_DISARM;
        cmd._param1 = 0; // disarm
        cmd._param2 = 0;
        break;
      case "takeoff": {
        cmd.command = MavCmd.NAV_TAKEOFF;
        // PX4's MAV_CMD_NAV_TAKEOFF via COMMAND_LONG interprets param7 as
        // ABSOLUTE altitude (MSL), not relative-to-home. The user picks a
        // relative altitude in the UI; we add the current MSL position to
        // turn it into an absolute target. (Using COMMAND_INT with
        // MAV_FRAME_GLOBAL_RELATIVE_ALT would also work, but COMMAND_LONG
        // is simpler and our store always has fresh telemetry.)
        const snap = this.store.snapshot();
        const currentMsl = snap.position?.altitudeMsl ?? 0;
        const relativeTarget = params.altitude ?? 5;
        const absoluteTarget = currentMsl + relativeTarget;

        cmd._param1 = 0;                              // min pitch (irrelevant for multirotor)
        cmd._param4 = NaN;                            // yaw (NaN = unchanged)
        cmd._param5 = NaN;                            // lat (NaN = current)
        cmd._param6 = NaN;                            // lon
        cmd._param7 = absoluteTarget;
        break;
      }
      case "land":
        cmd.command = MavCmd.NAV_LAND;
        cmd._param4 = NaN;                            // yaw
        cmd._param5 = NaN;                            // lat (NaN = current)
        cmd._param6 = NaN;                            // lon
        cmd._param7 = 0;                              // ground altitude
        break;
      case "rtl":
        cmd.command = MavCmd.DO_SET_MODE;
        cmd._param1 = CUSTOM_MODE_ENABLED;
        cmd._param2 = PX4_MAIN_AUTO;
        cmd._param3 = PX4_AUTO_RTL;
        break;
      case "hold":
        cmd.command = MavCmd.DO_SET_MODE;
        cmd._param1 = CUSTOM_MODE_ENABLED;
        cmd._param2 = PX4_MAIN_AUTO;
        cmd._param3 = PX4_AUTO_LOITER;
        break;
      default:
        return null;
    }

    return cmd;
  }
}
