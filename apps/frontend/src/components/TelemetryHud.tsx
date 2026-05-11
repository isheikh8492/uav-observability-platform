import { useTelemetryStore } from "../stores/telemetryStore.js";
import { MetricCard } from "./MetricCard.js";
import { AttitudeGauge } from "./AttitudeGauge.js";
import { ControlPanel } from "./ControlPanel.js";

/** Right-side panel showing live telemetry values. */
export function TelemetryHud() {
  const snapshot = useTelemetryStore((s) => s.snapshot);

  if (!snapshot) {
    return (
      <aside className="hud">
        <div className="empty-state">Waiting for telemetry…</div>
      </aside>
    );
  }

  const { attitude, position, battery, gps, state } = snapshot;
  const fixTypeLabel = formatFixType(gps?.fixType);

  return (
    <aside className="hud">
      <ControlPanel />

      <div className="hud__section-title">Vehicle</div>
      <MetricCard label="Mode" value={state?.flightMode ?? null} precision={0} />
      <MetricCard label="Armed" value={state ? (state.armed ? "Armed" : "Disarmed") : null} precision={0} />
      <MetricCard label="In Air" value={state ? (state.inAir ? "Flying" : "On ground") : null} precision={0} />

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
