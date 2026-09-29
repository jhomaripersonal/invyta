import { T } from "../lib/tokens";
import { useDialog } from "./useDialog";

// In-app replacement for window.confirm — matches the app, names the
// action on its button instead of "OK", and works in embedded browsers
// (some in-app browsers, e.g. Messenger's, block native dialogs).
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useDialog(onCancel);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28,41,66,0.45)" }} onClick={onCancel}>
      <div
        {...dialog.props}
        className="outline-none w-full max-w-sm rounded-2xl p-6"
        style={{ backgroundColor: T.white }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={dialog.titleId} className="text-base font-bold mb-1.5" style={{ color: T.charcoal }}>
          {title}
        </h2>
        {body && (
          <p className="text-sm mb-6" style={{ color: T.muted }}>
            {body}
          </p>
        )}
        <div className={`flex justify-end gap-2 ${body ? "" : "mt-6"}`}>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-50" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: danger ? T.red : T.accent, color: T.white }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
