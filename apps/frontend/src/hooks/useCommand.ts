import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, CommandKind, CommandResult, ServerMessage } from "@uav/types";

/**
 * Hook that opens its OWN WebSocket connection just for sending commands
 * and receiving their results.
 *
 * We use a separate socket from the telemetry stream so:
 * 1. Telemetry parsing isn't gated on command machinery
 * 2. Command results route back only to the sending client
 */
export function useCommand(url: string): {
  send: (kind: CommandKind, params?: Record<string, number>) => Promise<CommandResult>;
  lastResult: CommandResult | null;
  isPending: boolean;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, (result: CommandResult) => void>());
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [isPending, setIsPending] = useState(false);

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
          setLastResult(msg.data);
        } catch {
          /* ignore */
        }
      });

      ws.addEventListener("close", () => {
        if (!cancelled) {
          // Simple reconnect after 1 second
          setTimeout(connect, 1000);
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [url]);

  const send = useCallback(
    (kind: CommandKind, params?: Record<string, number>): Promise<CommandResult> => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("WebSocket not open"));
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const msg: ClientMessage = {
        type: "command",
        data: { requestId, kind, params },
      };

      return new Promise<CommandResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRef.current.delete(requestId);
          setIsPending(false);
          reject(new Error("Command timed out"));
        }, 5000);

        pendingRef.current.set(requestId, (result) => {
          clearTimeout(timeout);
          setIsPending(false);
          resolve(result);
        });

        setIsPending(true);
        ws.send(JSON.stringify(msg));
      });
    },
    []
  );

  return { send, lastResult, isPending };
}
