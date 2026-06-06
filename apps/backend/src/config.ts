/**
 * Backend configuration.
 *
 * Defaults match our Docker docker-compose.yml port mapping.
 * Override via environment variables.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadRootEnv();

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
  /** Whether to publish geospatial synthetic camera frames. */
  cameraEnabled: boolFromEnv("CAMERA_ENABLED", true),
  /** Synthetic camera frame generation rate, Hz. */
  cameraHz: numFromEnv("CAMERA_HZ", 2),
  /** Mapbox access token. If absent, camera frames report unavailable. */
  mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN ?? "",
  /** Mapbox style ID for static images. */
  mapboxStyle: process.env.MAPBOX_STYLE ?? "satellite-streets-v12",
  /** How long without a MAVLink message before we consider PX4 disconnected, ms. */
  connectionTimeoutMs: 3000,
} as const;

function loadRootEnv(): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const envPath = resolve(__dirname, "..", "..", "..", ".env");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    const rawValue = trimmed.slice(equalsAt + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = unquote(rawValue);
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${name}: "${raw}" is not a number`);
  }
  return parsed;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid ${name}: "${raw}" is not a boolean`);
}
