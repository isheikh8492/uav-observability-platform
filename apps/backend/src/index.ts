/**
 * Backend entry point.
 *
 * Pipeline (per vehicle):
 *
 *   PX4 SITL → MAVLink UDP → MavLinkListener
 *                              ↓
 *                          VehicleSession
 *                          ├─ TelemetryStore (raw data accumulator)
 *                          ├─ DroneStateMachine (semantic state)
 *                          └─ MavLinkCommander (command sender)
 *                              ↓
 *               broadcast loop @ 20 Hz
 *                              ↓
 *                       WebSocketServer
 *                              ↓
 *                          Frontend(s)
 *
 * Fleet support: VehicleSessions live inside a FleetService. Currently
 * we wire up one session, but the rest of the stack handles N vehicles.
 */

import { config } from "./config.js";
import { FleetService } from "./fleet/fleet.js";
import { VehicleSession } from "./fleet/vehicleSession.js";
import { createMavLinkListener } from "./mavlink/listener.js";
import { startHeartbeat } from "./mavlink/heartbeat.js";
import { TelemetryWebSocketServer } from "./websocket/server.js";
import { logger } from "./util/logger.js";
import { GeospatialVideoSource } from "./video/geospatialVideoSource.js";

logger.info("[backend] starting UAV telemetry backend");
logger.info("[backend] log file:", logger.filePath());
logger.info("[backend] config:", {
  ...config,
  mapboxAccessToken: config.mapboxAccessToken ? "[configured]" : "[missing]",
});

// 1. Fleet — currently one vehicle but the model supports many.
const fleet = new FleetService();

// 2. MAVLink ingest pipeline (one UDP socket per vehicle — shared for now)
const { listener, socket } = createMavLinkListener(config.mavlinkListenPort);

// 3. Vehicle 1 — bound to the single MAVLink endpoint we're listening to.
//    Adding a second drone = create another listener + session on a new port.
const vehicle1 = new VehicleSession({
  vehicleId: "vehicle-1",
  name: "Vehicle 1",
  socket,
  targetHost: config.mavlinkPx4Host,
  targetPort: config.mavlinkPx4Port,
  connectionTimeoutMs: config.connectionTimeoutMs,
});
fleet.add(vehicle1);

// Route MAVLink events into the session
listener.on("telemetry", (update) => vehicle1.applyTelemetry(update));
listener.on("heartbeat", () => vehicle1.recordHeartbeat());
listener.on("commandAck", ({ cmd, result }) => vehicle1.applyCommandAck(cmd, result));
listener.on("statusText", ({ severity, text }) => vehicle1.applyStatusText(severity, text));
listener.on("error", (err) => logger.error("[mavlink] socket error:", err.message));

// 4. Outbound heartbeat — keeps PX4 streaming back to us
const stopHeartbeat = startHeartbeat({
  socket,
  targetHost: config.mavlinkPx4Host,
  targetPort: config.mavlinkPx4Port,
  hz: config.heartbeatHz,
});

// 5. WebSocket server
const wsServer = new TelemetryWebSocketServer(config.wsPort);
const videoSource = new GeospatialVideoSource({
  accessToken: config.mapboxAccessToken,
  style: config.mapboxStyle,
  enabled: config.cameraEnabled,
});

wsServer.on("clientMessage", (msg, client, clientSession) => {
  if (msg.type !== "command") return;
  const { vehicleId, requestId, kind, params } = msg.data;

  const session = fleet.get(vehicleId);
  if (!session) {
    wsServer.sendTo(client, {
      type: "command_result",
      data: {
        requestId,
        vehicleId,
        kind,
        sent: false,
        error: `Unknown vehicle: ${vehicleId}`,
        errorCode: "UNKNOWN_VEHICLE",
      },
    });
    return;
  }

  session
    .executeCommand(kind, params, clientSession.sessionId)
    .then(() => {
      wsServer.sendTo(client, {
        type: "command_result",
        data: { requestId, vehicleId, kind, sent: true },
      });
    })
    .catch((err: Error & { code?: string }) => {
      const errorCode =
        err.code === "VEHICLE_BUSY"
          ? "VEHICLE_BUSY"
          : ("SEND_FAILED" as const);
      logger.error(
        `[commander] failed to send ${kind} to ${vehicleId} [session ${clientSession.sessionId}]:`,
        err.message
      );
      wsServer.sendTo(client, {
        type: "command_result",
        data: {
          requestId,
          vehicleId,
          kind,
          sent: false,
          error: err.message,
          errorCode,
        },
      });
    });
});

// Broadcast fleet status whenever the set of connected sessions changes.
wsServer.on("sessionsChanged", () => {
  wsServer.broadcast({
    type: "fleet_status",
    data: {
      sessionCount: wsServer.clientCount,
      sessionIds: wsServer.allSessionIds(),
      yourSessionId: "", // each client already received their own ID at connect
    },
  });
});

// 6. Broadcast loop — pushes every vehicle's state to all clients
const broadcastInterval = setInterval(() => {
  if (wsServer.clientCount === 0) return;

  for (const session of fleet.list()) {
    session.tick(); // drives timeout-based FSM transitions
    wsServer.broadcast({
      type: "vehicle",
      data: session.payload(),
    });
  }
}, 1000 / config.broadcastHz);

// 7. Synthetic camera loop — lower-rate, image-bearing stream.
let cameraTickInFlight = false;
const cameraInterval = setInterval(() => {
  if (wsServer.clientCount === 0 || cameraTickInFlight) return;
  cameraTickInFlight = true;

  void (async () => {
    try {
      for (const session of fleet.list()) {
        const frame = await videoSource.frameFor(session.payload());
        wsServer.broadcast({
          type: "camera_frame",
          data: frame,
        });
      }
    } catch (err) {
      logger.error("[camera] failed to publish frame:", err);
    } finally {
      cameraTickInFlight = false;
    }
  })();
}, 1000 / config.cameraHz);

// 8. Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`[backend] received ${signal}, shutting down...`);
  clearInterval(broadcastInterval);
  clearInterval(cameraInterval);
  stopHeartbeat();
  socket.close();
  await wsServer.close();
  logger.info("[backend] shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info("[backend] all systems ready, awaiting telemetry...");
