import { useState } from "react";

interface AltitudePromptProps {
  x: number;
  y: number;
  defaultAltitude: number;
  title: string;
  confirmLabel: string;
  onConfirm: (altitude: number) => void;
  onCancel: () => void;
}

/**
 * Tiny inline prompt for commands that need an altitude — used by Takeoff and Goto.
 * Anchored at the cursor position like the context menu it replaces.
 */
export function AltitudePrompt({
  x,
  y,
  defaultAltitude,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: AltitudePromptProps) {
  const [alt, setAlt] = useState(defaultAltitude);

  const flipped = x + 240 > window.innerWidth;
  const style: React.CSSProperties = {
    position: "fixed",
    top: y,
    left: flipped ? undefined : x,
    right: flipped ? window.innerWidth - x : undefined,
    zIndex: 1000,
  };

  return (
    <div className="prompt" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <div className="prompt__title">{title}</div>
      <div className="prompt__row">
        <label className="prompt__label">Altitude</label>
        <input
          className="prompt__input"
          type="number"
          min={1}
          max={120}
          step={1}
          value={alt}
          autoFocus
          onChange={(e) => setAlt(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(alt);
            if (e.key === "Escape") onCancel();
          }}
        />
        <span className="prompt__unit">m</span>
      </div>
      <div className="prompt__actions">
        <button className="prompt__btn prompt__btn--cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="prompt__btn prompt__btn--confirm"
          onClick={() => onConfirm(alt)}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
