import type { CommandKind, DroneState } from "@uav/types";

/** A single context-menu action for a vehicle. */
export interface VehicleAction {
  /** Unique key (matches CommandKind when applicable). */
  key: CommandKind;
  /** Label shown in the menu. */
  label: string;
  /** Brief description (shown as title attr / hover). */
  description?: string;
  /** Whether this action requires the operator to confirm or pick params. */
  requiresInput?: "altitude";
  /** Visual emphasis. */
  variant?: "primary" | "destructive" | "default";
}

/**
 * Returns the actions valid for the vehicle's current state.
 * Used by the right-click context menu on the drone marker.
 *
 * Single source of truth — UI doesn't reason about armed/inAir, it just
 * asks the FSM state what's available.
 */
export function vehicleActions(state: DroneState): VehicleAction[] {
  switch (state.name) {
    case "disconnected":
    case "connected":
      return [];

    case "disarmed":
      return [
        { key: "arm", label: "Arm", description: "Prepare for takeoff" },
      ];

    case "arming":
      return []; // transient state — nothing to click until armed/denied

    case "armed":
      return [
        {
          key: "takeoff",
          label: "Takeoff…",
          description: "Climb to specified altitude",
          requiresInput: "altitude",
          variant: "primary",
        },
        { key: "disarm", label: "Disarm", variant: "destructive" },
      ];

    case "takingOff":
      return [
        { key: "hold", label: "Hold", description: "Cancel takeoff, hover here" },
        { key: "land", label: "Land", variant: "destructive" },
      ];

    case "hovering":
      return [
        { key: "rtl", label: "Return to Launch" },
        { key: "land", label: "Land", variant: "destructive" },
      ];

    case "enRoute":
      return [
        { key: "hold", label: "Hold", description: "Stop here, abort travel" },
        { key: "rtl", label: "Return to Launch" },
        { key: "land", label: "Land", variant: "destructive" },
      ];

    case "returningToLaunch":
      return [
        { key: "hold", label: "Hold", description: "Pause RTL, hover here" },
        { key: "land", label: "Land Now", variant: "destructive" },
      ];

    case "landing":
      return []; // can't really stop a landing safely

    case "emergency":
      return [
        { key: "land", label: "Emergency Land", variant: "destructive" },
        { key: "disarm", label: "Force Disarm", variant: "destructive" },
      ];
  }
}

/** Whether the operator can issue a "Fly to here" goto command in this state. */
export function canGoto(state: DroneState): boolean {
  return state.name === "hovering" || state.name === "enRoute";
}

/** Stage banner label for the HUD. */
export function bannerFor(state: DroneState, connected: boolean): string {
  if (!connected) return "OFFLINE";
  switch (state.name) {
    case "disconnected": return "WAITING FOR LINK…";
    case "connected":    return "CONNECTED";
    case "disarmed":     return "DISARMED";
    case "arming":       return "ARMING…";
    case "armed":        return "ARMED · READY FOR TAKEOFF";
    case "takingOff":    return `TAKING OFF · TARGET ${state.targetAltitudeRelative}m`;
    case "hovering":     return "HOVERING";
    case "enRoute":      return "EN ROUTE TO TARGET";
    case "returningToLaunch": return "RETURNING TO LAUNCH";
    case "landing":      return "LANDING";
    case "emergency":    return `EMERGENCY · ${state.reason}`;
  }
}

/** Tone — drives banner color. */
export function bannerTone(
  state: DroneState,
  connected: boolean
): "idle" | "active" | "ready" | "alert" | "transient" {
  if (!connected) return "alert";
  switch (state.name) {
    case "disconnected":
    case "connected":
    case "disarmed":
      return "idle";
    case "arming":
    case "takingOff":
    case "landing":
    case "returningToLaunch":
      return "transient";
    case "armed":
      return "ready";
    case "hovering":
    case "enRoute":
      return "active";
    case "emergency":
      return "alert";
  }
}
