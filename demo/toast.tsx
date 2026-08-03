import { createContext, useCallback, useContext, useMemo } from "react";
import { ToastContainer, toast, type ToastOptions } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type ToastLevel = "success" | "error" | "info";

type ToastContextValue = {
  pushToast: (message: string, level?: ToastLevel) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_OPTIONS: ToastOptions = {
  autoClose: 3200,
  closeOnClick: true,
  draggable: true,
  pauseOnHover: true,
};

function showToast(message: string, level: ToastLevel) {
  switch (level) {
    case "success":
      toast.success(message, TOAST_OPTIONS);
      return;
    case "error":
      toast.error(message, TOAST_OPTIONS);
      return;
    default:
      toast.info(message, TOAST_OPTIONS);
  }
}

export function ToastProvider(props: { children: React.ReactNode }) {
  const pushToast = useCallback(
    (message: string, level: ToastLevel = "info") => {
      showToast(message, level);
    },
    [],
  );

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <ToastContainer
        position="top-right"
        newestOnTop
        theme="colored"
        aria-label="Notifications"
      />
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
