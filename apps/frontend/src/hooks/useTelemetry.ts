import { useEffect } from "react";
import type { ServerMessage } from "@uav/types";
import { useFleetStore } from "../stores/fleetStore.js";

/**
 * Hook that connects to the backend WebSocket and pipes vehicle messages
 * into the Zustand fleet store.
 *
 * Auto-reconnects with exponential backoff if the connection drops.
 * Mount this once at the app root (e.g., in <App />).
 */
export function useTelemetry(url: string): void {
  const upsertVehicle = useFleetStore((s) => s.upsertVehicle);
  const setCameraFrame = useFleetStore((s) => s.setCameraFrame);
  const setFleetStatus = useFleetStore((s) => s.setFleetStatus);

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
        reconnectDelayMs = 250;
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type === "vehicle") {
            upsertVehicle(msg.data);
          } else if (msg.type === "camera_frame") {
            setCameraFrame(msg.data);
          } else if (msg.type === "fleet_status") {
            setFleetStatus(msg.data);
          } else if (msg.type === "error") {
            console.error("[ws] server error:", msg.data);
          }
          // command_result handled by useCommand hook (its own WS connection)
        } catch (err) {
          console.error("[ws] failed to parse message:", err);
        }
      });

      ws.addEventListener("close", () => {
        if (cancelled) return;
        console.log(`[ws] disconnected, reconnecting in ${reconnectDelayMs}ms`);
        reconnectTimer = window.setTimeout(connect, reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 5000);
      });

      ws.addEventListener("error", (event) => {
        console.warn("[ws] connection error", event);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [url, upsertVehicle, setCameraFrame, setFleetStatus]);
}
