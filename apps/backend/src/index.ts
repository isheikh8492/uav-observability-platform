/**
 * Backend entry point.
 *
 * Phase 1 will implement:
 *   - MAVLink UDP listener (ingests from PX4 SITL)
 *   - Telemetry parser (MAVLink → TelemetrySnapshot)
 *   - WebSocket server (broadcasts to frontend)
 */

import type { TelemetrySnapshot } from "@uav/types";

const placeholder: TelemetrySnapshot = {
  timestamp: Date.now(),
  attitude: null,
  position: null,
  battery: null,
  gps: null,
  state: null,
};

console.log("[backend] starting...");
console.log("[backend] workspace types working — sample snapshot:", placeholder);
console.log("[backend] (Phase 1 implementation pending)");
