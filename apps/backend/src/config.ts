/**
 * Backend configuration.
 *
 * Defaults match our Docker docker-compose.yml port mapping.
 * Override via environment variables.
 */

export const config = {
  /** Port we listen on for MAVLink telemetry from PX4. */
  mavlinkListenPort: numFromEnv("MAVLINK_LISTEN_PORT", 14550),
  /** Host where PX4 listens for our heartbeats. */
  mavlinkPx4Host: process.env.MAVLINK_PX4_HOST ?? "127.0.0.1",
  /** Port where PX4 listens for our heartbeats. */
  mavlinkPx4Port: numFromEnv("MAVLINK_PX4_PORT", 18570),
  /** Heartbeat send rate, Hz. PX4 expects 1 Hz minimum. */
  heartbeatHz: 1,
  /** WebSocket server port. */
  wsPort: numFromEnv("WS_PORT", 8080),
  /** Telemetry broadcast rate to frontends, Hz. */
  broadcastHz: numFromEnv("BROADCAST_HZ", 20),
  /** How long without a MAVLink message before we consider PX4 disconnected, ms. */
  connectionTimeoutMs: 3000,
} as const;

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${name}: "${raw}" is not a number`);
  }
  return parsed;
}
