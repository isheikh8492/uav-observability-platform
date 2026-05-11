import type { VehicleId, VehiclePayload } from "@uav/types";

import type { VehicleSession } from "./vehicleSession.js";

/**
 * The set of vehicles known to this backend.
 *
 * Currently a thin map. Will grow to handle:
 *  - Dynamic discovery (new MAVLink endpoint appearing on the network)
 *  - Per-vehicle UDP port allocation
 *  - Fleet-wide commands (eventually)
 */
export class FleetService {
  private readonly sessions = new Map<VehicleId, VehicleSession>();

  add(session: VehicleSession): void {
    this.sessions.set(session.vehicleId, session);
  }

  get(vehicleId: VehicleId): VehicleSession | undefined {
    return this.sessions.get(vehicleId);
  }

  list(): VehicleSession[] {
    return [...this.sessions.values()];
  }

  /** Used by the broadcast loop to send all vehicles' state in each tick. */
  payloads(): VehiclePayload[] {
    return this.list().map((s) => s.payload());
  }
}
