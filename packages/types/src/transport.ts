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

/** Backend → Frontend message envelope. */
export type ServerMessage =
  | { type: "telemetry"; data: TelemetrySnapshot }
  | { type: "connection"; data: ConnectionStatus }
  | { type: "error"; data: { message: string; code?: string } };

/** Frontend → Backend message envelope (future: control commands). */
export type ClientMessage =
  | { type: "ping" }
  | { type: "subscribe"; channels: Array<"telemetry" | "connection"> };
