import { ConnectionBadge } from "./ConnectionBadge.js";
import { MapPane } from "./MapPane.js";
import { TelemetryHud } from "./TelemetryHud.js";

export function Layout() {
  return (
    <div className="app">
      <header className="top-bar">
        <div className="top-bar__title">
          UAV Observability Platform
          <span className="top-bar__title-suffix">— PX4 SITL</span>
        </div>
        <div className="top-bar__right">
          <ConnectionBadge />
        </div>
      </header>

      <div className="main">
        <MapPane />
        <TelemetryHud />
      </div>
    </div>
  );
}
