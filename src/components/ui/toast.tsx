"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";

type Toast = {
  id: number;
  tone: Tone;
  message: string;
};

type ToastContextValue = {
  push: (message: string, tone?: Tone) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONES: Record<Tone, string> = {
  info: "bg-white border-border text-ink",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  error: "bg-coral/10 border-coral/40 text-coral",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);

  const push = React.useCallback((message: string, tone: Tone = "info") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-md border px-4 py-3 shadow-md text-sm font-medium",
              TONES[t.tone],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
