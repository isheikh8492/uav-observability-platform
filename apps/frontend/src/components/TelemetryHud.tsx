import { useFleetStore, useSelectedVehicle } from "../stores/fleetStore.js";
import { bannerFor, bannerTone } from "../lib/vehicleActions.js";
import { MetricCard } from "./MetricCard.js";
import { AttitudeGauge } from "./AttitudeGauge.js";
import { CameraPane } from "./CameraPane.js";

/** Right-side panel showing the selected vehicle's live telemetry. */
export function TelemetryHud() {
  const vehicle = useSelectedVehicle();
  const lastResult = useFleetStore((s) => s.lastCommandResult);
  const fleetStatus = useFleetStore((s) => s.fleetStatus);
  const dismissResult = useFleetStore((s) => s.setLastCommandResult);

  if (!vehicle) {
    return (
      <aside className="hud hud--empty">
        <div className="empty-state">
          <div className="empty-state__title">No vehicle selected</div>
          <div className="empty-state__hint">
            Click a drone on the map to inspect it.<br />
            Right-click a drone for actions.
          </div>
        </div>
      </aside>
    );
  }

  const { state, snapshot, connection, name, inflightCommand } = vehicle;
  const { attitude, position, battery, gps } = snapshot;
  const fixTypeLabel = formatFixType(gps?.fixType);
  const banner = bannerFor(state, connection.connected);
  const tone = bannerTone(state, connection.connected);

  // Resolve who issued the inflight command (you or someone else)
  let inflightLabel: string | null = null;
  if (inflightCommand) {
    const isMe = inflightCommand.sessionId === fleetStatus?.yourSessionId;
    inflightLabel = isMe
      ? `Sending ${inflightCommand.kind}…`
      : `Other operator sending ${inflightCommand.kind}…`;
  }

  return (
    <aside className="hud">
      <div className="hud__vehicle-header">
        <div className="hud__vehicle-name">{name}</div>
        <div className="hud__vehicle-id">{vehicle.vehicleId}</div>
      </div>

      <div className={`stage-banner stage-banner--${tone}`}>{banner}</div>

      <div className="hud__section-title">Camera</div>
      <CameraPane />

      {inflightLabel && (
        <div className="inflight-banner" title={`Started by session ${inflightCommand?.sessionId}`}>
          <span className="inflight-banner__spinner" />
          {inflightLabel}
        </div>
      )}

      {lastResult && !lastResult.sent && (
        <div className="command-error" onClick={() => dismissResult(null)}>
          <span className="command-error__title">
            {lastResult.errorCode === "VEHICLE_BUSY" ? "Vehicle busy" : "Command failed"}
          </span>
          <span className="command-error__msg">{lastResult.error ?? "Unknown error"}</span>
          <span className="command-error__dismiss">✕</span>
        </div>
      )}

      <div className="hud__section-title">Position</div>
      <MetricCard label="Altitude" value={position?.altitudeRelative ?? null} unit="m" />
      <MetricCard label="Ground Speed" value={position?.groundSpeed ?? null} unit="m/s" precision={2} />
      <MetricCard label="Vertical Speed" value={position?.verticalSpeed ?? null} unit="m/s" precision={2} />
      <MetricCard
        label="Heading"
        value={position ? radToDeg(position.heading) : null}
        unit="°"
        precision={0}
      />

      <div className="hud__section-title">Attitude</div>
      <AttitudeGauge />
      <MetricCard label="Roll"  value={attitude ? radToDeg(attitude.roll)  : null} unit="°" precision={1} />
      <MetricCard label="Pitch" value={attitude ? radToDeg(attitude.pitch) : null} unit="°" precision={1} />
      <MetricCard label="Yaw"   value={attitude ? radToDeg(attitude.yaw)   : null} unit="°" precision={1} />

      <div className="hud__section-title">Battery</div>
      <MetricCard label="Voltage"   value={battery?.voltage ?? null} unit="V" precision={2} />
      <MetricCard label="Current"   value={battery?.current ?? null} unit="A" precision={2} />
      <MetricCard
        label="Remaining"
        value={battery ? Math.round(battery.remaining * 100) : null}
        unit="%"
        precision={0}
      />

      <div className="hud__section-title">GPS</div>
      <MetricCard label="Fix" value={fixTypeLabel} precision={0} />
      <MetricCard label="Satellites" value={gps?.satellitesVisible ?? null} precision={0} />
      <MetricCard label="HDOP" value={gps?.hdop ?? null} precision={2} />
    </aside>
  );
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function formatFixType(fixType: number | undefined): string | null {
  if (fixType === undefined) return null;
  switch (fixType) {
    case 0: return "No Fix";
    case 2: return "2D";
    case 3: return "3D";
    case 4: return "DGPS";
    case 5: return "RTK Float";
    case 6: return "RTK Fixed";
    default: return "Unknown";
  }
}
