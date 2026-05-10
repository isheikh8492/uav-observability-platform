import type {
  Attitude,
  Battery,
  ConnectionStatus,
  GpsStatus,
  Position,
  TelemetrySnapshot,
  VehicleState,
} from "@uav/types";

/**
 * Accumulates partial telemetry updates from MAVLink into a coherent snapshot.
 *
 * MAVLink sends each kind of data as a separate message at its own rate
 * (ATTITUDE at ~50 Hz, GLOBAL_POSITION_INT at ~5 Hz, BATTERY_STATUS at ~1 Hz, etc.).
 * The store keeps the latest value for each field and returns a unified snapshot
 * on demand. The frontend never sees the raw MAVLink cadence.
 */
export class TelemetryStore {
  private attitude: Attitude | null = null;
  private position: Position | null = null;
  private battery: Battery | null = null;
  private gps: GpsStatus | null = null;
  private state: VehicleState | null = null;

  private heartbeatCount = 0;
  private lastMessageAt: number | null = null;

  /** Update fields from a partial snapshot (called by MAVLink decoder). */
  applyUpdate(partial: Partial<{
    attitude: Attitude;
    position: Position;
    battery: Battery;
    gps: GpsStatus;
    state: VehicleState;
  }>): void {
    if (partial.attitude) this.attitude = partial.attitude;
    if (partial.position) this.position = partial.position;
    if (partial.battery) this.battery = partial.battery;
    if (partial.gps) this.gps = partial.gps;
    if (partial.state) this.state = partial.state;
    this.lastMessageAt = Date.now();
  }

  /** Called when a HEARTBEAT message arrives. */
  recordHeartbeat(): void {
    this.heartbeatCount += 1;
    this.lastMessageAt = Date.now();
  }

  /** Returns a snapshot of the current state. */
  snapshot(): TelemetrySnapshot {
    return {
      timestamp: Date.now(),
      attitude: this.attitude,
      position: this.position,
      battery: this.battery,
      gps: this.gps,
      state: this.state,
    };
  }

  /** Returns the connection status to PX4. */
  connectionStatus(connectionTimeoutMs: number): ConnectionStatus {
    const connected =
      this.lastMessageAt !== null &&
      Date.now() - this.lastMessageAt < connectionTimeoutMs;
    return {
      connected,
      heartbeatCount: this.heartbeatCount,
      lastMessageAt: this.lastMessageAt,
    };
  }
}
