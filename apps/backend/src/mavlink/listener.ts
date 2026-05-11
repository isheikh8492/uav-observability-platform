import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import {
  MavLinkPacketSplitter,
  MavLinkPacketParser,
  type MavLinkPacket,
} from "node-mavlink";
import { common, minimal } from "node-mavlink";

import { decode, type DecoderUpdate } from "./decoder.js";
import { logger } from "../util/logger.js";

/**
 * MAVLink message registry — maps MAVLink message IDs to TypeScript classes
 * that know how to deserialize their payloads.
 *
 * `minimal` covers HEARTBEAT and a handful of basics; `common` covers the
 * vast majority of messages PX4 sends in normal operation (ATTITUDE,
 * GLOBAL_POSITION_INT, BATTERY_STATUS, GPS_RAW_INT, etc).
 */
const REGISTRY = {
  ...minimal.REGISTRY,
  ...common.REGISTRY,
};

const COMMAND_ACK_RESULT: Record<number, string> = {
  0: "ACCEPTED",
  1: "TEMPORARILY_REJECTED",
  2: "DENIED",
  3: "UNSUPPORTED",
  4: "FAILED",
  5: "IN_PROGRESS",
  6: "CANCELLED",
};

const STATUS_TEXT_SEVERITY: Record<number, string> = {
  0: "EMERGENCY",
  1: "ALERT",
  2: "CRITICAL",
  3: "ERROR",
  4: "WARNING",
  5: "NOTICE",
  6: "INFO",
  7: "DEBUG",
};

export interface MavLinkListenerEvents {
  /** Emitted when a MAVLink message is decoded into a telemetry update. */
  telemetry: (update: DecoderUpdate) => void;
  /** Emitted when a HEARTBEAT message is received (separate channel for connection tracking). */
  heartbeat: () => void;
  /** Emitted on socket errors. */
  error: (err: Error) => void;
}

export interface MavLinkListener extends EventEmitter {
  on<K extends keyof MavLinkListenerEvents>(
    event: K,
    listener: MavLinkListenerEvents[K]
  ): this;
  emit<K extends keyof MavLinkListenerEvents>(
    event: K,
    ...args: Parameters<MavLinkListenerEvents[K]>
  ): boolean;
}

/**
 * Opens a UDP socket on `port`, parses MAVLink frames, and emits decoded
 * telemetry updates.
 *
 * Returns the underlying dgram socket so callers can also send packets
 * (e.g., heartbeats) through the same socket — important because PX4 routes
 * telemetry back to whatever address sent it the heartbeat.
 */
export function createMavLinkListener(port: number): {
  listener: MavLinkListener;
  socket: dgram.Socket;
} {
  const listener = new EventEmitter() as MavLinkListener;
  const socket = dgram.createSocket("udp4");

  // The MAVLink stream parser:
  //   raw bytes → splitter (finds packet boundaries) → parser (decodes header+payload)
  const splitter = new MavLinkPacketSplitter();
  const parser = new MavLinkPacketParser();

  splitter.pipe(parser);

  parser.on("data", (packet: MavLinkPacket) => {
    const Clazz = REGISTRY[packet.header.msgid];
    if (!Clazz) {
      // Unknown message ID — common during initial connection or for
      // PX4-specific extensions we don't care about. Silently skip.
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = packet.protocol.data(packet.payload, Clazz) as unknown as Record<string, unknown>;
    } catch (err) {
      // Malformed payload — log once at debug level eventually, ignore for now.
      return;
    }

    const msgName = Clazz.MSG_NAME;

    if (msgName === "HEARTBEAT") {
      listener.emit("heartbeat");
    }

    // Log PX4's responses to our commands so we can see arm/takeoff failures.
    // MAV_RESULT values:
    //   0 ACCEPTED, 1 TEMPORARILY_REJECTED, 2 DENIED, 3 UNSUPPORTED,
    //   4 FAILED, 5 IN_PROGRESS, 6 CANCELLED
    if (msgName === "COMMAND_ACK") {
      const cmdId = data.command;
      const result = data.result;
      const resultName = COMMAND_ACK_RESULT[Number(result)] ?? `UNKNOWN(${result})`;
      logger.info(`[mavlink] COMMAND_ACK cmd=${cmdId} result=${result} (${resultName})`);
    }

    // PX4 publishes human-readable warnings/errors via STATUSTEXT (note: no
    // underscore — MAVLink's naming is inconsistent). Failures like
    // "Takeoff denied: ..." or "Disarmed by auto preflight" come through here.
    if (msgName === "STATUSTEXT") {
      const text = String(data.text ?? "").replace(/\0+$/, "").trim();
      if (text) {
        const sev = Number(data.severity ?? 6);
        const sevName = STATUS_TEXT_SEVERITY[sev] ?? `SEV${sev}`;
        logger.info(`[mavlink] STATUSTEXT [${sevName}] ${text}`);
      }
    }

    const update = decode(msgName, data);
    if (update) {
      listener.emit("telemetry", update);
    }
  });

  socket.on("message", (msg) => {
    splitter.write(msg);
  });

  socket.on("error", (err) => {
    listener.emit("error", err);
  });

  socket.bind(port, () => {
    logger.info(`[mavlink] listening on UDP :${port}`);
  });

  return { listener, socket };
}
