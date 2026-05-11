import { useFleetStore } from "../stores/fleetStore.js";

/**
 * Shows how many operators are currently connected.
 * Hidden if there's only one (the current user). Surfaces useful info
 * when other operators join.
 */
export function OperatorBadge() {
  const fleetStatus = useFleetStore((s) => s.fleetStatus);
  if (!fleetStatus) return null;

  const count = fleetStatus.sessionCount;
  const yourId = fleetStatus.yourSessionId;

  // Single operator → don't clutter the bar
  if (count <= 1) {
    return (
      <span className="operator-badge" title={`Your session: ${yourId}`}>
        <span className="operator-badge__dot" /> You
      </span>
    );
  }

  // Multiple operators → show count, with hover detail
  return (
    <span
      className="operator-badge operator-badge--multi"
      title={`Sessions: ${fleetStatus.sessionIds.join(", ")}\nYour session: ${yourId}`}
    >
      <span className="operator-badge__dot" /> {count} operators
    </span>
  );
}
