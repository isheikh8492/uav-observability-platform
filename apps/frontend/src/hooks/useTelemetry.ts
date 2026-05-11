import { useEffect } from "react";
import type { ServerMessage } from "@uav/types";
import { useTelemetryStore } from "../stores/telemetryStore.js";

/**
 * Hook that connects to the backend WebSocket and pipes messages
 * into the Zustand store.
 *
 * Auto-reconnects with exponential backoff if the connection drops.
 * Mount this once at the app root (e.g., in <App />).
 */
export function useTelemetry(url: string): void {
  const setSnapshot = useTelemetryStore((s) => s.setSnapshot);
  const setConnection = useTelemetryStore((s) => s.setConnection);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectDelayMs = 250;

    const connect = (): void => {
      if (cancelled) return;
      ws = new WebSocket(url);

      ws.addEventListener("open", () => {
        console.log(`[ws] connected to ${url}`);
        reconnectDelayMs = 250; // reset backoff on successful connect
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          switch (msg.type) {
            case "telemetry":
              setSnapshot(msg.data);
              break;
            case "connection":
              setConnection(msg.data);
              break;
            case "error":
              console.error("[ws] server error:", msg.data);
              break;
          }
        } catch (err) {
          console.error("[ws] failed to parse message:", err);
        }
      });

      ws.addEventListener("close", () => {
        if (cancelled) return;
        console.log(`[ws] disconnected, reconnecting in ${reconnectDelayMs}ms`);
        reconnectTimer = window.setTimeout(connect, reconnectDelayMs);
        // Exponential backoff capped at 5 seconds
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 5000);
      });

      ws.addEventListener("error", (event) => {
        // Browsers don't expose much detail; the close event will fire next.
        console.warn("[ws] connection error", event);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [url, setSnapshot, setConnection]);
}
