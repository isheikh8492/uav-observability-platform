import { useEffect, useRef, useState } from "react";

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

/** How long destructive actions wait for a second click before resetting. */
const DESTRUCTIVE_CONFIRM_WINDOW_MS = 2000;
/** How long the "just clicked" visual pulse stays on. */
const CLICK_FEEDBACK_MS = 280;

/**
 * A floating action menu anchored at a viewport position.
 *
 * Behaviors:
 *   - Dismisses on click outside or Escape key
 *   - Auto-flips horizontally if it would overflow the right edge
 *   - Destructive items (Land, Disarm, …) require a SECOND click within 2s
 *     to fire — protects against spam-clicking and accidental aborts of
 *     in-progress maneuvers
 *   - Every click pulses the item briefly so the operator sees it registered
 */
export function ContextMenu({ x, y, items, header, onDismiss }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  /** Key of destructive item awaiting a second-click confirmation. */
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  /** Seconds remaining for the pending confirm to expire. */
  const [secondsLeft, setSecondsLeft] = useState(0);
  /** Key of item that was just clicked (for visual flash). */
  const [justClicked, setJustClicked] = useState<string | null>(null);

  // Pending-confirm countdown + auto-expire
  useEffect(() => {
    if (!pendingConfirm) return;
    setSecondsLeft(Math.ceil(DESTRUCTIVE_CONFIRM_WINDOW_MS / 1000));
    const tick = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const expire = window.setTimeout(() => {
      setPendingConfirm(null);
      setSecondsLeft(0);
    }, DESTRUCTIVE_CONFIRM_WINDOW_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(expire);
    };
  }, [pendingConfirm]);

  const handleItemClick = (item: ContextMenuItem): void => {
    if (item.disabled) return;

    // Visual click feedback for every click
    setJustClicked(item.key);
    window.setTimeout(() => {
      setJustClicked((prev) => (prev === item.key ? null : prev));
    }, CLICK_FEEDBACK_MS);

    // Destructive confirmation: first click arms, second click fires
    if (item.variant === "destructive") {
      if (pendingConfirm === item.key) {
        // Confirmed — fire and reset
        setPendingConfirm(null);
        item.onClick();
        return;
      }
      // First press on a destructive: arm confirmation, don't fire yet
      setPendingConfirm(item.key);
      return;
    }

    // Non-destructive: fire immediately and clear any pending confirmation
    // (operator changed their mind / picked a different action).
    setPendingConfirm(null);
    item.onClick();
  };

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
      {items.map((item) => {
        const isPending = pendingConfirm === item.key;
        const isFlashing = justClicked === item.key;
        const classes = [
          "context-menu__item",
          `context-menu__item--${item.variant ?? "default"}`,
          isPending && "context-menu__item--pending-confirm",
          isFlashing && "context-menu__item--just-clicked",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={classes}
            // We do NOT auto-dismiss after click. The action's onClick decides —
            // fire-and-stay-open for single commands, or change overlay state for
            // prompts (the menu unmounts naturally). Outside-click and Escape
            // still dismiss via the document handlers above.
            onClick={() => handleItemClick(item)}
            title={item.description}
          >
            <span className="context-menu__label">
              {isPending ? `Click again to confirm: ${item.label}` : item.label}
            </span>
            {isPending ? (
              <span className="context-menu__desc">
                Expires in {secondsLeft}s · click elsewhere to cancel
              </span>
            ) : item.description ? (
              <span className="context-menu__desc">{item.description}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
