import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import {
  MavLinkPacketSplitter,
  MavLinkPacketParser,
  type MavLinkPacket,
} from "node-mavlink";
import { common, minimal } from "node-mavlink";

import { decode, type DecoderUpdate } from "./decoder.js";

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
    console.log(`[mavlink] listening on UDP :${port}`);
  });

  return { listener, socket };
}
