import { useEffect, useId, useRef } from "react";

// Accessible modal behavior for the app's dialogs: Escape closes, Tab stays
// inside the dialog, focus moves into it on open and back to whatever
// opened it on close, and the page behind doesn't scroll.
//
//   const dialog = useDialog(onClose);
//   <div {...dialog.props}> <h2 id={dialog.titleId}>…</h2> … </div>

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last — only the top one answers Escape and Tab,
// so a dialog opened from another (e.g. Upgrade from the Link dialog)
// closes on its own.
const stack: symbol[] = [];

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const token = Symbol("dialog");
    stack.push(token);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current;

    // Focus the first field if there is one (so typing can start at once),
    // otherwise the dialog itself — not the ✕ button in its corner.
    const firstField = node?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])");
    (firstField ?? node)?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== token || !node) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      if (stack.length === 0) document.body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);

  return {
    titleId,
    props: { ref, role: "dialog", "aria-modal": true, "aria-labelledby": titleId, tabIndex: -1 } as const,
  };
}
