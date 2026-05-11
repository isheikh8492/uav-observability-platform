import { useTelemetryStore } from "../stores/telemetryStore.js";

/** Live/offline indicator in the top bar. */
export function ConnectionBadge() {
  const connected = useTelemetryStore((s) => s.connection.connected);
  const heartbeats = useTelemetryStore((s) => s.connection.heartbeatCount);

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
