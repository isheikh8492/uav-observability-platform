/**
 * Core telemetry types — the data contract between backend and frontend.
 *
 * Field names mirror MAVLink semantics where possible, but we normalize
 * units and naming to be ergonomic for application code:
 *   - Angles: radians (matches MAVLink/PX4 convention)
 *   - Distances: meters
 *   - Speeds: meters/second
 *   - Timestamps: milliseconds since Unix epoch (NOT MAVLink microseconds)
 */

/** Vehicle orientation in the world frame. */
export interface Attitude {
  /** Roll angle, radians. Positive = right wing down. */
  roll: number;
  /** Pitch angle, radians. Positive = nose up. */
  pitch: number;
  /** Yaw angle, radians. Positive = clockwise from north (NED frame). */
  yaw: number;
  /** Roll rate, rad/s. */
  rollRate: number;
  /** Pitch rate, rad/s. */
  pitchRate: number;
  /** Yaw rate, rad/s. */
  yawRate: number;
}

/** Vehicle position and velocity in the world frame. */
export interface Position {
  /** Latitude, degrees. */
  latitude: number;
  /** Longitude, degrees. */
  longitude: number;
  /** Altitude above mean sea level, meters. */
  altitudeMsl: number;
  /** Altitude above takeoff/home, meters. */
  altitudeRelative: number;
  /** Ground speed, m/s. */
  groundSpeed: number;
  /** Vertical speed, m/s. Positive = climbing. */
  verticalSpeed: number;
  /** Heading over ground, radians. */
  heading: number;
}

/** Battery status. */
export interface Battery {
  /** Voltage, volts. */
  voltage: number;
  /** Current draw, amps. Negative = charging (rare in flight). */
  current: number;
  /** State of charge, 0.0 to 1.0. */
  remaining: number;
  /** Estimated time remaining at current draw, seconds. Null if unknown. */
  timeRemaining: number | null;
}

/** GPS fix quality. */
export interface GpsStatus {
  /** Number of satellites visible. */
  satellitesVisible: number;
  /**
   * Fix type:
   *   0 = no fix
   *   2 = 2D fix
   *   3 = 3D fix
   *   4 = DGPS
   *   5 = RTK float
   *   6 = RTK fixed
   */
  fixType: 0 | 2 | 3 | 4 | 5 | 6;
  /** Horizontal dilution of precision (lower = better). */
  hdop: number;
  /** Vertical dilution of precision. */
  vdop: number;
}

/** Vehicle's current operational state. */
export interface VehicleState {
  /** Whether the motors can spin. */
  armed: boolean;
  /** Current flight mode (PX4 string: "MANUAL", "STABILIZED", "OFFBOARD", "AUTO.MISSION", etc). */
  flightMode: string;
  /** Whether the vehicle is currently flying (in air). */
  inAir: boolean;
}

/**
 * A complete telemetry snapshot for a single vehicle.
 *
 * This is what the backend sends to the frontend over the WebSocket.
 * Any individual field may be `null` if no MAVLink message has populated it yet
 * (e.g., GPS may not be locked at boot, attitude may arrive before position).
 */
export interface TelemetrySnapshot {
  /** Backend-side timestamp of when this snapshot was assembled (ms since epoch). */
  timestamp: number;
  /** Latest attitude data, or null if not yet received. */
  attitude: Attitude | null;
  /** Latest position data, or null if not yet received. */
  position: Position | null;
  /** Latest battery data, or null if not yet received. */
  battery: Battery | null;
  /** Latest GPS status, or null if not yet received. */
  gps: GpsStatus | null;
  /** Latest vehicle operational state. */
  state: VehicleState | null;
}

/** Identifier used to distinguish vehicles in a fleet. */
export type VehicleId = string;
