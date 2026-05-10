import { WebSocketServer, WebSocket } from "ws";
import type { ServerMessage } from "@uav/types";

/**
 * WebSocket fan-out server.
 *
 * Accepts multiple frontend connections and broadcasts the same telemetry
 * to all of them. Disconnects are handled silently — the next broadcast
 * just skips dead clients.
 */
export class TelemetryWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws, req) => {
      const remote = req.socket.remoteAddress ?? "unknown";
      console.log(`[ws] client connected from ${remote} (${this.clients.size + 1} total)`);
      this.clients.add(ws);

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`[ws] client disconnected (${this.clients.size} remaining)`);
      });

      ws.on("error", (err) => {
        console.error(`[ws] client error from ${remote}:`, err.message);
      });
    });

    console.log(`[ws] listening on :${port}`);
  }

  /** Broadcast a server message to all connected clients. */
  broadcast(message: ServerMessage): void {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload, (err) => {
          if (err) {
            // Client likely disconnected mid-send. Will be cleaned up by 'close' event.
          }
        });
      }
    }
  }

  /** Number of currently connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }

  /** Stop accepting new connections and close existing ones. */
  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        client.close();
      }
      this.wss.close(() => resolve());
    });
  }
}
