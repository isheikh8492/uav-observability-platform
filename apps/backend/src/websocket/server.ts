import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@uav/types";

import { logger } from "../util/logger.js";

/** Lightweight per-connection metadata attached to each WebSocket. */
export interface ClientSession {
  /** Stable opaque session ID, generated on connect. */
  sessionId: string;
  /** When this session connected. */
  connectedAt: number;
  /** Remote address (best-effort, may be undefined). */
  remoteAddress: string;
}

export interface TelemetryWebSocketServerEvents {
  /** Emitted when a client sends a message (parsed from JSON). */
  clientMessage: (
    message: ClientMessage,
    client: WebSocket,
    session: ClientSession
  ) => void;
  /** Emitted when a client connects or disconnects (session set has changed). */
  sessionsChanged: () => void;
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
  /** Map from socket → its session metadata. */
  private clients = new Map<WebSocket, ClientSession>();

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
      const session: ClientSession = {
        sessionId: shortId(randomUUID()),
        connectedAt: Date.now(),
        remoteAddress: remote,
      };
      this.clients.set(ws, session);
      logger.info(
        `[ws] [session ${session.sessionId}] connected from ${remote} (${this.clients.size} total)`
      );

      // Tell the new client which session ID is theirs — they need this to
      // distinguish "me" from other connected operators.
      this.sendTo(ws, {
        type: "fleet_status",
        data: {
          sessionCount: this.clients.size,
          sessionIds: this.allSessionIds(),
          yourSessionId: session.sessionId,
        },
      });
      this.emit("sessionsChanged");

      ws.on("message", (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as ClientMessage;
          this.emit("clientMessage", parsed, ws, session);
        } catch (err) {
          logger.error(
            `[ws] [session ${session.sessionId}] failed to parse message:`,
            err
          );
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        logger.info(
          `[ws] [session ${session.sessionId}] disconnected (${this.clients.size} remaining)`
        );
        this.emit("sessionsChanged");
      });

      ws.on("error", (err) => {
        logger.error(
          `[ws] [session ${session.sessionId}] error:`,
          err.message
        );
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

    for (const client of this.clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload, () => {
          /* swallow per-client send errors — 'close' event handles cleanup */
        });
      }
    }
  }

  /** Number of currently connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }

  /** All connected session IDs (for the fleet_status payload). */
  allSessionIds(): string[] {
    return [...this.clients.values()].map((s) => s.sessionId);
  }

  /** Stop accepting new connections and close existing ones. */
  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients.keys()) {
        client.close();
      }
      this.wss.close(() => resolve());
    });
  }
}

/** Trim a UUID down to its first 8 chars for compact log/UI display. */
function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8);
}
