import type {
  Attitude,
  Battery,
  GpsStatus,
  Position,
  VehicleState,
} from "@uav/types";

/**
 * Maps a decoded MAVLink message into a partial telemetry update.
 *
 * Returns `null` if the message type isn't one we care about
 * (PX4 sends many messages we don't surface yet).
 *
 * @param msgName - MAVLink class name (e.g., "Attitude", "GlobalPositionInt")
 * @param data    - Decoded message fields
 */
export type DecoderUpdate = Partial<{
  attitude: Attitude;
  position: Position;
  battery: Battery;
  gps: GpsStatus;
  state: VehicleState;
}>;

export function decode(msgName: string, data: Record<string, unknown>): DecoderUpdate | null {
  // node-mavlink exposes the original MAVLink message name as Clazz.MSG_NAME
  // (uppercase, snake_case), e.g. "ATTITUDE", "GLOBAL_POSITION_INT".
  switch (msgName) {
    case "ATTITUDE":
      return decodeAttitude(data);
    case "GLOBAL_POSITION_INT":
      return decodeGlobalPosition(data);
    case "GPS_RAW_INT":
      return decodeGpsRaw(data);
    case "BATTERY_STATUS":
      return decodeBatteryStatus(data);
    case "HEARTBEAT":
      return decodeHeartbeat(data);
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function decodeAttitude(d: Record<string, unknown>): DecoderUpdate {
  return {
    attitude: {
      roll: num(d.roll),
      pitch: num(d.pitch),
      yaw: num(d.yaw),
      rollRate: num(d.rollspeed),
      pitchRate: num(d.pitchspeed),
      yawRate: num(d.yawspeed),
    },
  };
}

function decodeGlobalPosition(d: Record<string, unknown>): DecoderUpdate {
  // MAVLink GLOBAL_POSITION_INT uses int32 scaled values:
  //   lat/lon: degrees * 1e7
  //   alt:     millimeters above MSL
  //   relativeAlt: millimeters above home
  return {
    position: {
      latitude: num(d.lat) / 1e7,
      longitude: num(d.lon) / 1e7,
      altitudeMsl: num(d.alt) / 1000,
      altitudeRelative: num(d.relativeAlt) / 1000,
      // VFR_HUD provides cleaner ground/vertical speed; we leave these
      // approximated here and let VFR_HUD overwrite if available.
      groundSpeed: Math.hypot(num(d.vx) / 100, num(d.vy) / 100),
      verticalSpeed: -num(d.vz) / 100, // MAVLink: positive = down. We invert.
      heading: (num(d.hdg) / 100) * (Math.PI / 180), // hdg is centidegrees
    },
  };
}

function decodeGpsRaw(d: Record<string, unknown>): DecoderUpdate {
  const fixType = num(d.fixType);
  return {
    gps: {
      satellitesVisible: num(d.satellitesVisible),
      fixType: clampFixType(fixType),
      hdop: num(d.eph) / 100, // MAVLink: cm. Convert to meters.
      vdop: num(d.epv) / 100,
    },
  };
}

function decodeBatteryStatus(d: Record<string, unknown>): DecoderUpdate {
  // BATTERY_STATUS:
  //   voltages[] in mV, take first cell sum or use battery_remaining percent
  //   current_battery in cA (centiamps)
  //   battery_remaining 0-100 (-1 if unknown)
  const remainingPct = num(d.batteryRemaining);
  const voltages = d.voltages as number[] | undefined;
  const totalVoltageMv = voltages
    ? voltages.filter((v) => v !== 65535).reduce((a, b) => a + b, 0)
    : 0;

  return {
    battery: {
      voltage: totalVoltageMv / 1000,
      current: num(d.currentBattery) / 100,
      remaining: remainingPct < 0 ? 0 : remainingPct / 100,
      timeRemaining: null, // PX4 doesn't reliably populate this
    },
  };
}

function decodeHeartbeat(d: Record<string, unknown>): DecoderUpdate {
  // HEARTBEAT carries:
  //   base_mode bitfield (bit 7 = MAV_MODE_FLAG_SAFETY_ARMED)
  //   custom_mode (PX4-specific encoding of flight mode)
  //   system_status (active/critical/etc)
  const baseMode = num(d.baseMode);
  const armed = (baseMode & 0x80) !== 0; // MAV_MODE_FLAG_SAFETY_ARMED
  const systemStatus = num(d.systemStatus);
  const inAir = systemStatus === 4; // MAV_STATE_ACTIVE

  return {
    state: {
      armed,
      flightMode: decodeCustomMode(num(d.customMode)),
      inAir,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function clampFixType(v: number): GpsStatus["fixType"] {
  if (v === 2 || v === 3 || v === 4 || v === 5 || v === 6) return v;
  return 0;
}

/**
 * PX4 custom_mode encoding (32-bit):
 *   bytes [0]   = sub-mode
 *   bytes [1-2] = main-mode
 *   bytes [3]   = unused
 *
 * See PX4: src/modules/commander/px4_custom_mode.h
 */
function decodeCustomMode(customMode: number): string {
  const mainMode = (customMode >> 16) & 0xff;
  const subMode = (customMode >> 24) & 0xff;

  const main = MAIN_MODES[mainMode] ?? `UNKNOWN(${mainMode})`;
  if (mainMode === 4 /* AUTO */) {
    const sub = AUTO_SUB_MODES[subMode] ?? `UNKNOWN(${subMode})`;
    return `${main}.${sub}`;
  }
  return main;
}

const MAIN_MODES: Record<number, string> = {
  1: "MANUAL",
  2: "ALTCTL",
  3: "POSCTL",
  4: "AUTO",
  5: "ACRO",
  6: "OFFBOARD",
  7: "STABILIZED",
  8: "RATTITUDE",
};

const AUTO_SUB_MODES: Record<number, string> = {
  1: "READY",
  2: "TAKEOFF",
  3: "LOITER",
  4: "MISSION",
  5: "RTL",
  6: "LAND",
  8: "FOLLOW_TARGET",
  9: "PRECLAND",
};
