import type { DroneEvent, DroneState, TelemetrySnapshot } from "@uav/types";

/**
 * Per-vehicle state machine — interprets MAVLink events into semantic states.
 *
 * This is the authoritative source of truth for "what is the drone doing right now."
 * Telemetry fields like `armed` and `inAir` are inputs; the FSM combines them with
 * intent (what commands have been sent), command acknowledgements, and timeouts
 * to produce a single coherent state.
 *
 * Frontend consumes the FSM state directly — it doesn't re-derive anything.
 * Adding a new state = adding to the discriminated union in @uav/types and
 * a case in `transition()`. Compiler guides the rest.
 */

const ARM_DISARM_CMD = 400;        // MAV_CMD_COMPONENT_ARM_DISARM
const ARMING_TIMEOUT_MS = 5000;
const HOVER_TOLERANCE_M = 0.5;      // climbed within this of target → hovering
const ARRIVAL_TOLERANCE_M = 3.0;    // close to goto target → hovering
const CRITICAL_SEVERITY = 2;        // STATUSTEXT severity ≤ 2 (EMERGENCY/ALERT/CRITICAL)

export class DroneStateMachine {
  private state: DroneState = { name: "disconnected" };

  current(): DroneState {
    return this.state;
  }

  handle(event: DroneEvent): DroneState {
    const next = this.transition(this.state, event);
    this.state = next;
    return next;
  }

  /** Manual override (for testing or recovery). */
  reset(): void {
    this.state = { name: "disconnected" };
  }

  // ───────────────────────────────────────────────────────────────────────────

  private transition(current: DroneState, event: DroneEvent): DroneState {
    // Global transitions — any state can fall into emergency on a critical alert.
    if (event.type === "status_text" && event.severity <= CRITICAL_SEVERITY) {
      return { name: "emergency", reason: event.text };
    }

    switch (current.name) {
      case "disconnected":
        if (event.type === "telemetry") {
          return { name: "connected", since: Date.now() };
        }
        return current;

      case "connected":
        // First proper telemetry tells us the actual state.
        if (event.type === "telemetry") {
          return this.deriveFromTelemetry(event.snapshot) ?? current;
        }
        return current;

      case "disarmed":
        if (event.type === "command_sent" && event.kind === "arm") {
          return { name: "arming", commandSentAt: Date.now() };
        }
        // External arm (e.g., via QGC)
        if (event.type === "telemetry" && event.snapshot.state?.armed) {
          return event.snapshot.state.inAir ? { name: "hovering" } : { name: "armed" };
        }
        return current;

      case "arming":
        if (event.type === "telemetry" && event.snapshot.state?.armed) {
          return { name: "armed" };
        }
        if (
          event.type === "command_ack" &&
          event.cmd === ARM_DISARM_CMD &&
          event.result !== 0
        ) {
          return { name: "disarmed" };
        }
        if (event.type === "tick" && event.now - current.commandSentAt > ARMING_TIMEOUT_MS) {
          return { name: "disarmed" };
        }
        return current;

      case "armed":
        if (event.type === "telemetry" && !event.snapshot.state?.armed) {
          return { name: "disarmed" };
        }
        if (event.type === "command_sent" && event.kind === "takeoff") {
          const targetRel = event.params?.altitude ?? 5;
          return { name: "takingOff", targetAltitudeRelative: targetRel };
        }
        // External takeoff
        if (event.type === "telemetry" && event.snapshot.state?.inAir) {
          return { name: "hovering" };
        }
        return current;

      case "takingOff":
        if (event.type === "telemetry") {
          const s = event.snapshot;
          if (!s.state?.armed) return { name: "disarmed" };
          if (s.position) {
            const reached =
              Math.abs(s.position.altitudeRelative - current.targetAltitudeRelative) < HOVER_TOLERANCE_M &&
              Math.abs(s.position.verticalSpeed) < HOVER_TOLERANCE_M;
            if (reached) return { name: "hovering" };
          }
        }
        return current;

      case "hovering":
        if (event.type === "telemetry") {
          if (!event.snapshot.state?.armed) return { name: "disarmed" };
          if (!event.snapshot.state?.inAir) return { name: "armed" };
        }
        if (event.type === "command_sent") {
          if (event.kind === "goto") {
            return {
              name: "enRoute",
              target: {
                lat: event.params?.latitude ?? 0,
                lon: event.params?.longitude ?? 0,
                alt: event.params?.altitude ?? 0,
              },
            };
          }
          if (event.kind === "rtl") return { name: "returningToLaunch" };
          if (event.kind === "land") return { name: "landing" };
        }
        return current;

      case "enRoute":
        if (event.type === "telemetry") {
          if (!event.snapshot.state?.armed) return { name: "disarmed" };
          if (event.snapshot.position) {
            const d = haversineMeters(
              event.snapshot.position.latitude,
              event.snapshot.position.longitude,
              current.target.lat,
              current.target.lon,
            );
            if (d < ARRIVAL_TOLERANCE_M) return { name: "hovering" };
          }
        }
        if (event.type === "command_sent") {
          if (event.kind === "hold") return { name: "hovering" };
          if (event.kind === "rtl") return { name: "returningToLaunch" };
          if (event.kind === "land") return { name: "landing" };
          if (event.kind === "goto") {
            return {
              name: "enRoute",
              target: {
                lat: event.params?.latitude ?? 0,
                lon: event.params?.longitude ?? 0,
                alt: event.params?.altitude ?? 0,
              },
            };
          }
        }
        return current;

      case "returningToLaunch":
        if (event.type === "telemetry") {
          const s = event.snapshot;
          if (!s.state?.armed) return { name: "disarmed" };
          if (!s.state?.inAir) return { name: "armed" };
        }
        if (event.type === "command_sent" && event.kind === "hold") {
          return { name: "hovering" };
        }
        return current;

      case "landing":
        if (event.type === "telemetry") {
          const s = event.snapshot;
          if (!s.state?.armed) return { name: "disarmed" };
          if (!s.state?.inAir) return { name: "armed" };
        }
        return current;

      case "emergency":
        // Sticky: clear only on explicit disarm/landed.
        if (event.type === "telemetry" && !event.snapshot.state?.armed) {
          return { name: "disarmed" };
        }
        return current;
    }
  }

  /**
   * Best-effort initial state derivation when we first see telemetry
   * (e.g., backend started after PX4 was already armed/flying).
   */
  private deriveFromTelemetry(snapshot: TelemetrySnapshot): DroneState | null {
    const vs = snapshot.state;
    if (!vs) return null;
    if (!vs.armed) return { name: "disarmed" };
    if (vs.inAir) return { name: "hovering" };
    return { name: "armed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

/** Haversine distance between two lat/lon points, in meters. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
