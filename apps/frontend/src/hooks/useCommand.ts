import { useCallback, useEffect, useRef } from "react";
import type {
  ClientMessage,
  CommandKind,
  CommandResult,
  ServerMessage,
  VehicleId,
} from "@uav/types";

/**
 * Hook that opens a dedicated WebSocket for sending commands and
 * receiving their results.
 *
 * Returns a `send` function — call it with (vehicleId, kind, params)
 * and you get a Promise that resolves with the CommandResult.
 */
export function useCommand(url: string): {
  send: (
    vehicleId: VehicleId,
    kind: CommandKind,
    params?: Record<string, number>
  ) => Promise<CommandResult>;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, (result: CommandResult) => void>());

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    const connect = (): void => {
      if (cancelled) return;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type !== "command_result") return;
          const resolver = pendingRef.current.get(msg.data.requestId);
          if (resolver) {
            pendingRef.current.delete(msg.data.requestId);
            resolver(msg.data);
          }
        } catch {
          /* ignore non-JSON */
        }
      });

      ws.addEventListener("close", () => {
        if (!cancelled) setTimeout(connect, 1000);
      });
    };

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [url]);

  const send = useCallback(
    (
      vehicleId: VehicleId,
      kind: CommandKind,
      params?: Record<string, number>
    ): Promise<CommandResult> => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("WebSocket not open"));
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const msg: ClientMessage = {
        type: "command",
        data: { vehicleId, requestId, kind, params },
      };

      return new Promise<CommandResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRef.current.delete(requestId);
          reject(new Error("Command timed out"));
        }, 5000);

        pendingRef.current.set(requestId, (result) => {
          clearTimeout(timeout);
          resolve(result);
        });

        ws.send(JSON.stringify(msg));
      });
    },
    []
  );

  return { send };
}
