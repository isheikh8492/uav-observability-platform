import { ConnectionBadge } from "./ConnectionBadge.js";
import { MapPane } from "./MapPane.js";
import { TelemetryHud } from "./TelemetryHud.js";
import { OperatorBadge } from "./OperatorBadge.js";
import { useFleetStore } from "../stores/fleetStore.js";

export function Layout() {
  const hasSelection = useFleetStore((s) => s.selectedVehicleId !== null);
  return (
    <div className="app">
      <header className="top-bar">
        <div className="top-bar__title">
          UAV Observability Platform
          <span className="top-bar__title-suffix">— PX4 SITL</span>
        </div>
        <div className="top-bar__right">
          <OperatorBadge />
          <ConnectionBadge />
        </div>
      </header>

      <div className={`main ${hasSelection ? "" : "main--no-selection"}`}>
        <MapPane />
        <TelemetryHud />
      </div>
    </div>
  );
}
