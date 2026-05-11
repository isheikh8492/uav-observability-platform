interface MetricCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  precision?: number;
}

/** A single label / value tile in the telemetry HUD. */
export function MetricCard({ label, value, unit, precision = 1 }: MetricCardProps) {
  const display =
    value === null || value === undefined
      ? "—"
      : typeof value === "number"
      ? value.toFixed(precision)
      : value;

  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <span className="metric__value">
        {display}
        {unit && value !== null && <span className="metric__unit">{unit}</span>}
      </span>
    </div>
  );
}
