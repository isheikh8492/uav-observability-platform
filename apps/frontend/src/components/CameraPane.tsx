import { useSelectedCameraFrame } from "../stores/fleetStore.js";

export function CameraPane() {
  const frame = useSelectedCameraFrame();

  if (!frame) {
    return (
      <div className="camera-pane camera-pane--empty">
        <div className="camera-pane__status">Camera</div>
        <div className="camera-pane__message">Waiting for camera frame</div>
      </div>
    );
  }

  const live = frame.status === "live" && frame.imageDataUrl;

  return (
    <div className={`camera-pane ${live ? "camera-pane--live" : "camera-pane--unavailable"}`}>
      <div className="camera-pane__viewport">
        {live ? (
          <img className="camera-pane__image" src={frame.imageDataUrl} alt="Synthetic aerial camera frame" />
        ) : (
          <div className="camera-pane__placeholder">
            <span className="camera-pane__placeholder-title">Camera unavailable</span>
            <span className="camera-pane__placeholder-reason">{frame.reason ?? "No image source"}</span>
          </div>
        )}

        <div className="camera-pane__live-badge">
          <span className="camera-pane__dot" />
          {live ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      <div className="camera-pane__meta">
        <CameraMeta label="Provider" value={frame.provider === "mapbox" ? "Mapbox" : "None" } />
        <CameraMeta label="Alt" value={formatMeters(frame.altitudeRelative)} />
        <CameraMeta label="Heading" value={formatDegrees(frame.bearing)} />
        <CameraMeta label="Zoom" value={frame.zoom?.toFixed(2) ?? "—"} />
        <CameraMeta label="Lat" value={formatCoord(frame.latitude)} />
        <CameraMeta label="Lon" value={formatCoord(frame.longitude)} />
      </div>
    </div>
  );
}

function CameraMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="camera-pane__meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMeters(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}m`;
}

function formatDegrees(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(0)}°`;
}

function formatCoord(value: number | null): string {
  return value === null ? "—" : value.toFixed(5);
}

