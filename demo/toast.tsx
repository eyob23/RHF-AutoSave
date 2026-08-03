import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastLevel = "success" | "error" | "info";

type ToastRecord = {
  id: string;
  message: string;
  level: ToastLevel;
};

type ToastContextValue = {
  pushToast: (message: string, level?: ToastLevel) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider(props: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const pushToast = useCallback(
    (message: string, level: ToastLevel = "info") => {
      const nextToast: ToastRecord = {
        id: createToastId(),
        message,
        level,
      };

      setToasts((current) => [...current, nextToast]);

      window.setTimeout(() => {
        setToasts((current) =>
          current.filter((toast) => toast.id !== nextToast.id),
        );
      }, 3200);
    },
    [],
  );

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <aside className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.level}`}>
            {toast.message}
          </div>
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
