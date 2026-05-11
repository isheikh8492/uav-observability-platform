import { useFleetStore } from "../stores/fleetStore.js";

/**
 * Live/offline indicator in the top bar.
 * Shows the connection status of the selected vehicle, or "Offline" if none.
 */
export function ConnectionBadge() {
  const vehicle = useFleetStore((s) =>
    s.selectedVehicleId ? s.vehicles.get(s.selectedVehicleId) : null
  );

  const connected = vehicle?.connection.connected ?? false;
  const heartbeats = vehicle?.connection.heartbeatCount ?? 0;

  return (
    <div
      className={`connection-badge ${
        connected ? "connection-badge--live" : "connection-badge--offline"
      }`}
      title={`Heartbeats received: ${heartbeats}`}
    >
      <span className="connection-badge__dot" />
      {connected ? "Live" : "Offline"}
    </div>
  );
}
