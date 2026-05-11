import { create } from "zustand";
import type { ConnectionStatus, TelemetrySnapshot } from "@uav/types";

/**
 * Telemetry store — single source of truth for the live drone state.
 *
 * High-frequency snapshot updates (20 Hz from backend) trigger React re-renders
 * via Zustand selectors. For now this is fine — text-based HUD widgets handle
 * 20 Hz easily. If we later add components that re-render expensively (heavy
 * charts, animations), we can switch those to read from refs / direct subscriptions.
 *
 * The store also carries the connection status so the UI can show
 * "live" vs "offline" badges.
 */

interface TelemetryState {
  snapshot: TelemetrySnapshot | null;
  connection: ConnectionStatus;

  setSnapshot: (snapshot: TelemetrySnapshot) => void;
  setConnection: (connection: ConnectionStatus) => void;
}

const initialConnection: ConnectionStatus = {
  connected: false,
  heartbeatCount: 0,
  lastMessageAt: null,
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  snapshot: null,
  connection: initialConnection,
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnection: (connection) => set({ connection }),
}));
