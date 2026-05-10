import dgram from "node:dgram";
import {
  MavLinkProtocolV2,
  send,
} from "node-mavlink";
import { minimal } from "node-mavlink";

const { Heartbeat, MavType, MavAutopilot, MavState, MavModeFlag } = minimal;

/**
 * Sends a HEARTBEAT message to PX4 over the given socket, periodically.
 *
 * PX4 uses heartbeats both to detect that a GCS exists (registers the address
 * to send telemetry to) and to detect link loss. We send at 1 Hz which is the
 * standard MAVLink GCS rate.
 *
 * The heartbeat is sent FROM the same socket that's receiving telemetry.
 * PX4's "remote port 14550" config means it'll send back to the source
 * address (our socket's bound port).
 *
 * Returns a stop function.
 */
export function startHeartbeat(opts: {
  socket: dgram.Socket;
  targetHost: string;
  targetPort: number;
  hz: number;
}): () => void {
  const { socket, targetHost, targetPort, hz } = opts;

  // We act as a generic GCS, MAVLink system ID 255 is conventional for ground stations.
  const systemId = 255;
  const componentId = 190; // MAV_COMP_ID_MISSIONPLANNER

  const heartbeat = new Heartbeat();
  heartbeat.type = MavType.GCS;
  heartbeat.autopilot = MavAutopilot.INVALID;
  heartbeat.baseMode = MavModeFlag.MANUAL_INPUT_ENABLED;
  heartbeat.customMode = 0;
  heartbeat.systemStatus = MavState.ACTIVE;
  heartbeat.mavlinkVersion = 3;

  // node-mavlink's `send()` writes to a Writable stream. We adapt it
  // to a UDP send by buffering then sending in one datagram.
  const writableAdapter = {
    write(chunk: Buffer, _encoding?: string, cb?: () => void): boolean {
      socket.send(chunk, targetPort, targetHost, () => cb?.());
      return true;
    },
  };

  const interval = setInterval(() => {
    send(writableAdapter as any, heartbeat, new MavLinkProtocolV2(systemId, componentId)).catch(
      (err) => {
        console.error("[heartbeat] send failed:", err.message);
      }
    );
  }, 1000 / hz);

  console.log(
    `[heartbeat] sending to ${targetHost}:${targetPort} at ${hz} Hz (systemId=${systemId})`
  );

  return () => clearInterval(interval);
}
