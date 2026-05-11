/**
 * Transport types — message envelopes that flow over the WebSocket.
 *
 * The frontend should pattern-match on `type` to dispatch handlers.
 * Adding new message types is a single-file change here that both
 * sides see immediately via the shared types package.
 */

import type { TelemetrySnapshot } from "./telemetry.js";

/** Connection state of the backend's link to PX4. */
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
  | "takeoff"   // params: { altitude: meters }
  | "land"
  | "rtl"       // return-to-launch
  | "hold";     // loiter at current position

export interface CommandRequest {
  kind: CommandKind;
  /** Optional parameters (e.g., { altitude: 10 } for takeoff). */
  params?: Record<string, number>;
  /** Client-generated ID so the response can be correlated back. */
  requestId: string;
}

export interface CommandResult {
  requestId: string;
  kind: CommandKind;
  /** True if the backend successfully sent the command to the vehicle. */
  sent: boolean;
  /** Human-readable error if sent=false. */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message envelopes

/** Backend → Frontend message envelope. */
export type ServerMessage =
  | { type: "telemetry"; data: TelemetrySnapshot }
  | { type: "connection"; data: ConnectionStatus }
  | { type: "command_result"; data: CommandResult }
  | { type: "error"; data: { message: string; code?: string } };

/** Frontend → Backend message envelope. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "subscribe"; channels: Array<"telemetry" | "connection"> }
  | { type: "command"; data: CommandRequest };
