import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// App-wide confirmation/error messages ("Link copied", "Couldn't publish").
// One polite live region, so screen readers announce each message too.

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };
type ToastFn = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const COLORS: Record<ToastKind, { bg: string; dot: string }> = {
  success: { bg: "#1C2942", dot: "#6FD3A0" },
  error: { bg: "#B42318", dot: "#FFFFFF" },
  info: { bg: "#1C2942", dot: "#E8C5C1" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastFn>(
    (message, kind = "success") => {
      const id = nextId.current++;
      // Newest last; keep at most three on screen.
      setToasts((t) => [...t.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed z-[100] bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium text-left shadow-lg"
            style={{ backgroundColor: COLORS[t.kind].bg, color: "#FFFFFF" }}
            aria-label={`${t.message} (dismiss)`}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[t.kind].dot }} />
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
