import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@uav/types";

import { logger } from "../util/logger.js";

export interface TelemetryWebSocketServerEvents {
  /** Emitted when a client sends a message (parsed from JSON). */
  clientMessage: (message: ClientMessage, client: WebSocket) => void;
}

/**
 * WebSocket fan-out server.
 *
 * Accepts multiple frontend connections and broadcasts the same telemetry
 * to all of them. Disconnects are handled silently — the next broadcast
 * just skips dead clients.
 *
 * Inbound: parses ClientMessage envelopes and re-emits them as events
 * so the rest of the backend can react (e.g., to command requests).
 */
export class TelemetryWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  override on<K extends keyof TelemetryWebSocketServerEvents>(
    event: K,
    listener: TelemetryWebSocketServerEvents[K]
  ): this;
  override on(event: string, listener: (...args: never[]) => void): this {
    return super.on(event, listener as never);
  }

  override emit<K extends keyof TelemetryWebSocketServerEvents>(
    event: K,
    ...args: Parameters<TelemetryWebSocketServerEvents[K]>
  ): boolean;
  override emit(event: string, ...args: never[]): boolean {
    return super.emit(event, ...args);
  }

  constructor(port: number) {
    super();
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws, req) => {
      const remote = req.socket.remoteAddress ?? "unknown";
      logger.info(`[ws] client connected from ${remote} (${this.clients.size + 1} total)`);
      this.clients.add(ws);

      ws.on("message", (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as ClientMessage;
          this.emit("clientMessage", parsed, ws);
        } catch (err) {
          logger.error(`[ws] failed to parse client message from ${remote}:`, err);
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        logger.info(`[ws] client disconnected (${this.clients.size} remaining)`);
      });

      ws.on("error", (err) => {
        logger.error(`[ws] client error from ${remote}:`, err.message);
      });
    });

    logger.info(`[ws] listening on :${port}`);
  }

  /** Send a message to a specific client (e.g., command result to the sender only). */
  sendTo(client: WebSocket, message: ServerMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
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
