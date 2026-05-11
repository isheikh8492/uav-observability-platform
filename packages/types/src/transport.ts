/**
 * Transport types — message envelopes that flow over the WebSocket.
 *
 * The frontend should pattern-match on `type` to dispatch handlers.
 * Adding new message types is a single-file change here that both
 * sides see immediately via the shared types package.
 */

import type { DroneState } from "./droneState.js";
import type { TelemetrySnapshot, VehicleId } from "./telemetry.js";

/** Connection state of the backend's link to a vehicle. */
export interface ConnectionStatus {
  /** True when the backend is receiving recent MAVLink heartbeats. */
  connected: boolean;
  /** Total heartbeats received since backend started. */
  heartbeatCount: number;
  /** Timestamp of last successful message (ms since epoch). Null if never connected. */
  lastMessageAt: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands

/**
 * Commands the operator can issue to the vehicle.
 *
 * These map to MAVLink MAV_CMD_* values in the backend, but the wire format
 * here is a friendly app-level enum so the frontend doesn't need to know
 * MAVLink internals.
 */
export type CommandKind =
  | "arm"
  | "disarm"
  | "takeoff"   // params: { altitude: meters above current MSL }
  | "land"
  | "rtl"       // return-to-launch
  | "hold"      // loiter at current position
  | "goto";     // params: { latitude, longitude, altitude? (meters MSL) }

export interface CommandRequest {
  /** Which vehicle this command targets. */
  vehicleId: VehicleId;
  kind: CommandKind;
  /** Optional parameters (e.g., { altitude: 10 } for takeoff). */
  params?: Record<string, number>;
  /** Client-generated ID so the response can be correlated back. */
  requestId: string;
}

export interface CommandResult {
  requestId: string;
  vehicleId: VehicleId;
  kind: CommandKind;
  /** True if the backend successfully sent the command to the vehicle. */
  sent: boolean;
  /** Human-readable error if sent=false. */
  error?: string;
  /** Machine-readable error code (e.g., "VEHICLE_BUSY"). */
  errorCode?: "VEHICLE_BUSY" | "UNKNOWN_VEHICLE" | "SEND_FAILED";
}

/** A command that the backend is currently processing for a vehicle. */
export interface InflightCommand {
  kind: CommandKind;
  /** Backend timestamp when this command started processing. */
  sentAt: number;
  /** ID of the WS session that issued the command. */
  sessionId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle envelope — one of these per known vehicle, broadcast on a tick

/**
 * Everything the frontend needs to render one vehicle.
 * Backend broadcasts these for every vehicle in the fleet.
 */
export interface VehiclePayload {
  vehicleId: VehicleId;
  /** Friendly display name (e.g., "Vehicle 1"). */
  name: string;
  /** Latest telemetry snapshot. */
  snapshot: TelemetrySnapshot;
  /** Derived semantic state from the FSM. */
  state: DroneState;
  /** Backend ↔ vehicle link health. */
  connection: ConnectionStatus;
  /** Command currently being processed, if any. Other operators see this and
   *  know the vehicle is busy. */
  inflightCommand: InflightCommand | null;
}

/** Fleet-wide status — who's connected, basic awareness. */
export interface FleetStatus {
  /** Number of operator sessions currently connected to the backend. */
  sessionCount: number;
  /** Short opaque IDs of connected sessions (UI uses these for awareness). */
  sessionIds: string[];
  /** ID of the current viewer's own session — frontend uses to identify "me". */
  yourSessionId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message envelopes

/** Backend → Frontend message envelope. */
export type ServerMessage =
  | { type: "vehicle"; data: VehiclePayload }
  | { type: "fleet_status"; data: FleetStatus }
  | { type: "command_result"; data: CommandResult }
  | { type: "error"; data: { message: string; code?: string } };

/** Frontend → Backend message envelope. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "subscribe"; channels: Array<"telemetry" | "connection"> }
  | { type: "command"; data: CommandRequest };
