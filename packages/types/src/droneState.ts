/**
 * Drone state machine — semantic states derived from raw telemetry + commands.
 *
 * Lives backend-side; frontend just renders whatever state arrives.
 * Each state may carry data specific to that state (e.g., enRoute carries
 * the target coordinates).
 *
 * Designed to be migrated to XState if hierarchical states become needed
 * (e.g., AUTO.* sub-states inside a single "auto" parent).
 */

import type { CommandKind } from "./transport.js";
import type { TelemetrySnapshot } from "./telemetry.js";

export type DroneStateName =
  | "disconnected"
  | "connected"
  | "disarmed"
  | "arming"
  | "armed"
  | "takingOff"
  | "hovering"
  | "enRoute"
  | "returningToLaunch"
  | "landing"
  | "emergency";

export type GeoTarget = {
  /** Latitude in degrees. */
  lat: number;
  /** Longitude in degrees. */
  lon: number;
  /** Altitude (MSL meters). */
  alt: number;
};

export type DroneState =
  | { name: "disconnected" }
  | { name: "connected"; since: number }
  | { name: "disarmed" }
  | { name: "arming"; commandSentAt: number }
  | { name: "armed" }
  | { name: "takingOff"; targetAltitudeRelative: number }
  | { name: "hovering" }
  | { name: "enRoute"; target: GeoTarget }
  | { name: "returningToLaunch" }
  | { name: "landing" }
  | { name: "emergency"; reason: string };

/** Events that drive transitions. */
export type DroneEvent =
  | { type: "telemetry"; snapshot: TelemetrySnapshot }
  | { type: "command_sent"; kind: CommandKind; params?: Record<string, number> }
  | { type: "command_ack"; cmd: number; result: number }
  | { type: "status_text"; severity: number; text: string }
  | { type: "tick"; now: number };
