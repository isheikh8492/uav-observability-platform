import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  key: string;
  label: string;
  description?: string;
  variant?: "primary" | "destructive" | "default";
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  /** Pixel position where the menu should anchor (relative to viewport). */
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Optional header text shown at the top of the menu. */
  header?: string;
  onDismiss: () => void;
}

/**
 * A floating action menu anchored at a viewport position.
 *
 * Dismisses on:
 *   - Click outside
 *   - Escape key
 *   - Item selection
 *
 * Auto-flips horizontally if it would overflow the right edge.
 */
export function ContextMenu({ x, y, items, header, onDismiss }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocPointer = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onDismiss();
    };
    // Defer attaching the listener so the click that opened the menu
    // doesn't immediately dismiss it.
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  // Flip horizontally if menu would overflow the right edge.
  // We do a rough estimate; could measure after first paint for precision.
  const flipped = x + 220 > window.innerWidth;
  const style: React.CSSProperties = {
    position: "fixed",
    top: y,
    left: flipped ? undefined : x,
    right: flipped ? window.innerWidth - x : undefined,
    zIndex: 1000,
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={ref} className="context-menu" style={style} role="menu">
      {header && <div className="context-menu__header">{header}</div>}
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={`context-menu__item context-menu__item--${item.variant ?? "default"}`}
          onClick={() => {
            item.onClick();
            onDismiss();
          }}
          title={item.description}
        >
          <span className="context-menu__label">{item.label}</span>
          {item.description && (
            <span className="context-menu__desc">{item.description}</span>
          )}
        </button>
      ))}
    </div>
  );
}
