import { create } from "zustand";
import type {
  CommandResult,
  FleetStatus,
  VehicleId,
  VehiclePayload,
} from "@uav/types";

/**
 * Fleet store — vehicles + selection + fleet-wide session awareness.
 *
 * The store also holds the most recent command result for the UI's
 * status banner (so VEHICLE_BUSY errors etc. surface visibly).
 */
interface FleetState {
  vehicles: Map<VehicleId, VehiclePayload>;
  selectedVehicleId: VehicleId | null;

  /** Fleet-wide status (number of operators, their session IDs). */
  fleetStatus: FleetStatus | null;

  /** Most recent command result — null after explicit dismiss. */
  lastCommandResult: CommandResult | null;

  upsertVehicle: (payload: VehiclePayload) => void;
  setFleetStatus: (status: FleetStatus) => void;
  setLastCommandResult: (result: CommandResult | null) => void;
  selectVehicle: (vehicleId: VehicleId) => void;
  deselectVehicle: () => void;
}

export const useFleetStore = create<FleetState>((set) => ({
  vehicles: new Map(),
  selectedVehicleId: null,
  fleetStatus: null,
  lastCommandResult: null,

  upsertVehicle: (payload) =>
    set((state) => {
      const next = new Map(state.vehicles);
      next.set(payload.vehicleId, payload);
      return {
        vehicles: next,
        // Auto-select the first vehicle that appears.
        selectedVehicleId: state.selectedVehicleId ?? payload.vehicleId,
      };
    }),

  setFleetStatus: (status) =>
    set((state) => {
      // The "yourSessionId" only appears on the very first message (sent
      // directly to the new client). Subsequent broadcasts have empty string,
      // so preserve whatever we already know.
      const yourSessionId = status.yourSessionId || state.fleetStatus?.yourSessionId || "";
      return { fleetStatus: { ...status, yourSessionId } };
    }),

  setLastCommandResult: (result) => set({ lastCommandResult: result }),

  selectVehicle: (vehicleId) => set({ selectedVehicleId: vehicleId }),
  deselectVehicle: () => set({ selectedVehicleId: null }),
}));

/** Selector hook for the currently-selected vehicle's payload. */
export function useSelectedVehicle(): VehiclePayload | null {
  const selectedId = useFleetStore((s) => s.selectedVehicleId);
  const vehicle = useFleetStore((s) => (selectedId ? s.vehicles.get(selectedId) : null));
  return vehicle ?? null;
}
