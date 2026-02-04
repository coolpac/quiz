import React, { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/cn";

export type ToastVariant = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

const MAX_VISIBLE_TOASTS = 3;
const TOAST_DEDUPE_MS = 2000;
const TOAST_DURATION_MS = 4000;

const ToastContext = React.createContext<{
  pushToast: (message: string, variant?: ToastVariant) => void;
}>({
  pushToast: () => undefined,
});

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastMessageRef = useRef<{ message: string; at: number } | null>(null);

  const pushToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const now = Date.now();
      const last = lastMessageRef.current;
      if (last?.message === message && now - last.at < TOAST_DEDUPE_MS) {
        return;
      }
      lastMessageRef.current = { message, at: now };

      const id = `${now}-${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => {
        const next = [...prev, { id, message, variant }];
        return next.slice(-MAX_VISIBLE_TOASTS);
      });
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, TOAST_DURATION_MS);
    },
    [],
  );

  const variantStyles: Record<ToastVariant, string> = {
    success: "bg-green-500/10 border-green-500/30 text-green-500",
    error: "bg-red-500/10 border-red-500/30 text-red-500",
    warning:
      "bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400",
    info: "bg-primary/10 border-primary/20 text-primary",
  };

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="fixed top-6 right-6 z-[300] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className={cn(
                "px-4 py-3 rounded-2xl border backdrop-blur-md shadow-lg text-sm font-bold",
                variantStyles[toast.variant],
              )}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => React.useContext(ToastContext);
