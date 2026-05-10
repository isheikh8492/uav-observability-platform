/**
 * Backend entry point.
 *
 * Pipeline:
 *
 *   PX4 SITL (Docker)
 *       ↓ MAVLink UDP
 *   MavLinkListener (UDP socket on :14550)
 *       ↓ decoder
 *   TelemetryStore (accumulates field updates)
 *       ↓ broadcast loop @ 20 Hz
 *   TelemetryWebSocketServer (:8080)
 *       ↓
 *   Frontend(s)
 *
 * Side channel:
 *   Heartbeat sender (1 Hz) → PX4 :18570
 *   Keeps the connection alive (PX4 needs to know we exist).
 */

import { config } from "./config.js";
import { createMavLinkListener } from "./mavlink/listener.js";
import { startHeartbeat } from "./mavlink/heartbeat.js";
import { TelemetryStore } from "./state/store.js";
import { TelemetryWebSocketServer } from "./websocket/server.js";

console.log("[backend] starting UAV telemetry backend");
console.log(`[backend] config:`, config);

// 1. Telemetry state aggregator
const store = new TelemetryStore();

// 2. MAVLink ingest pipeline
const { listener, socket } = createMavLinkListener(config.mavlinkListenPort);

listener.on("telemetry", (update) => {
  store.applyUpdate(update);
});

listener.on("heartbeat", () => {
  store.recordHeartbeat();
});

listener.on("error", (err) => {
  console.error("[mavlink] socket error:", err.message);
});

// 3. Outbound heartbeat — keeps PX4 streaming to us
const stopHeartbeat = startHeartbeat({
  socket,
  targetHost: config.mavlinkPx4Host,
  targetPort: config.mavlinkPx4Port,
  hz: config.heartbeatHz,
});

// 4. WebSocket server — fans out to frontends
const wsServer = new TelemetryWebSocketServer(config.wsPort);

// 5. Broadcast loop — pushes snapshots to all clients at a steady rate
const broadcastInterval = setInterval(() => {
  if (wsServer.clientCount === 0) return;

  wsServer.broadcast({
    type: "telemetry",
    data: store.snapshot(),
  });

  wsServer.broadcast({
    type: "connection",
    data: store.connectionStatus(config.connectionTimeoutMs),
  });
}, 1000 / config.broadcastHz);

// 6. Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[backend] received ${signal}, shutting down...`);
  clearInterval(broadcastInterval);
  stopHeartbeat();
  socket.close();
  await wsServer.close();
  console.log("[backend] shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[backend] all systems ready, awaiting telemetry...");
