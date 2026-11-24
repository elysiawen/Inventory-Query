"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: "blue" | "red";
  /** 只显示确认按钮，用于纯提示场景 */
  hideCancel?: boolean;
}

interface ConfirmContextValue {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm 必须在 ConfirmProvider 内使用");
  }
  return context;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{ message: string; options: ConfirmOptions }>({
    message: "",
    options: {},
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    setConfig({ message, options });
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
  }

  const { message, options } = config;
  const destructive = options.confirmColor === "red";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 animate-fade-in"
          onClick={() => settle(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl animate-zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800">{options.title ?? "确认操作"}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
              {message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              {!options.hideCancel && (
                <button
                  onClick={() => settle(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  {options.cancelText ?? "取消"}
                </button>
              )}
              <button
                onClick={() => settle(true)}
                className={`rounded-lg px-4 py-2 text-sm text-white transition ${
                  destructive ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {options.confirmText ?? "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
