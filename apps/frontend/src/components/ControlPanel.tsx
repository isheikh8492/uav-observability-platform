import { useState } from "react";
import type { CommandKind } from "@uav/types";

import { useCommand } from "../hooks/useCommand.js";
import { useTelemetryStore } from "../stores/telemetryStore.js";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:8080";

/**
 * Operator control panel — issues commands to the vehicle via the backend.
 *
 * Each button is enabled/disabled based on current vehicle state to prevent
 * obviously invalid actions (e.g., can't takeoff if not armed).
 */
export function ControlPanel() {
  const { send, isPending, lastResult } = useCommand(WS_URL);
  const state = useTelemetryStore((s) => s.snapshot?.state);
  const connected = useTelemetryStore((s) => s.connection.connected);

  const [takeoffAltitude, setTakeoffAltitude] = useState(5);
  const [lastError, setLastError] = useState<string | null>(null);

  const execute = async (kind: CommandKind, params?: Record<string, number>): Promise<void> => {
    setLastError(null);
    try {
      const result = await send(kind, params);
      if (!result.sent) {
        setLastError(result.error ?? "Command not sent");
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    }
  };

  const armed = state?.armed ?? false;
  const inAir = state?.inAir ?? false;
  const disabledBase = !connected || isPending;

  // Vehicle stage banner: tells the operator what action makes sense next.
  let stage: { label: string; tone: "idle" | "ready" | "active" };
  if (!connected) stage = { label: "Offline", tone: "idle" };
  else if (!armed) stage = { label: "Disarmed — click Arm to prepare", tone: "idle" };
  else if (armed && !inAir) stage = { label: "Armed · ready for takeoff", tone: "ready" };
  else stage = { label: `In flight · ${state?.flightMode ?? ""}`, tone: "active" };

  const takeoffReady = armed && !inAir && connected;

  return (
    <div className="control-panel">
      <div className="hud__section-title">Controls</div>

      <div className={`control-panel__stage control-panel__stage--${stage.tone}`}>
        {stage.label}
      </div>

      <div className="control-panel__grid">
        <button
          className="control-button control-button--arm"
          disabled={disabledBase || armed}
          onClick={() => void execute("arm")}
        >
          Arm
        </button>
        <button
          className="control-button control-button--disarm"
          disabled={disabledBase || !armed || inAir}
          onClick={() => void execute("disarm")}
        >
          Disarm
        </button>

        <div className="control-panel__takeoff">
          <button
            className={`control-button control-button--takeoff ${
              takeoffReady ? "control-button--primary" : ""
            }`}
            disabled={disabledBase || !armed || inAir}
            onClick={() => void execute("takeoff", { altitude: takeoffAltitude })}
          >
            Takeoff
          </button>
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            value={takeoffAltitude}
            onChange={(e) => setTakeoffAltitude(Number(e.target.value))}
            disabled={disabledBase}
            className="control-input"
            title="Target altitude (meters)"
          />
          <span className="control-input__unit">m</span>
        </div>

        <button
          className="control-button"
          disabled={disabledBase || !inAir}
          onClick={() => void execute("land")}
        >
          Land
        </button>

        <button
          className="control-button"
          disabled={disabledBase || !armed}
          onClick={() => void execute("hold")}
        >
          Hold
        </button>

        <button
          className="control-button"
          disabled={disabledBase || !armed}
          onClick={() => void execute("rtl")}
        >
          RTL
        </button>
      </div>

      {lastError && (
        <div className="control-panel__status control-panel__status--error">
          ✕ {lastError}
        </div>
      )}
      {!lastError && lastResult?.sent && (
        <div className="control-panel__status control-panel__status--ok">
          ✓ Sent: {lastResult.kind}
        </div>
      )}
    </div>
  );
}
