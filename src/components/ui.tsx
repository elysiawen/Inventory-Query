"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`flex w-full ${width} max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-zoom-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-xl leading-none text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Loading({
  text = "加载中…",
  fullScreen = false,
}: {
  text?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        fullScreen ? "min-h-screen" : "py-16"
      }`}
    >
      <Spinner className="h-8 w-8 text-blue-500" />
      <span className="text-sm text-slate-400">{text}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center">
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-1.5 text-sm text-red-600 transition hover:bg-red-100"
        >
          重试
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onChange: (p: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const [jump, setJump] = useState("");
  const hasRange = typeof total === "number" && typeof pageSize === "number";
  const lastPage = Math.max(1, totalPages);

  // 删除最后一页仅剩的数据后，页码可能超出总页数，自动回退
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) onChange(totalPages);
  }, [page, totalPages, onChange]);

  if (totalPages <= 1 && (!hasRange || total === 0)) return null;

  const from = hasRange && total! > 0 ? (page - 1) * pageSize! + 1 : 0;
  const to = hasRange ? Math.min(page * pageSize!, total!) : 0;

  function go(target: number) {
    if (target < 1 || target > lastPage) return;
    onChange(target);
  }

  function goJump() {
    const n = Number(jump);
    if (Number.isInteger(n) && n >= 1 && n <= lastPage) onChange(n);
    setJump("");
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {hasRange && (
        <div className="text-center text-sm text-slate-500 sm:text-left">
          显示第 {from}–{to} 条，共 {total} 条
        </div>
      )}
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        {pageSizeOptions && pageSize && onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-auto"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} 条/页
              </option>
            ))}
          </select>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
          <button
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            className="flex min-w-[70px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white sm:min-w-[90px] sm:px-4"
          >
            上一页
          </button>
          <div className="flex items-center gap-2 px-1 sm:px-2">
            <span className="whitespace-nowrap text-sm font-medium text-slate-600">
              第 {page} / {lastPage} 页
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={lastPage}
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goJump();
                }}
                className="w-12 rounded-md border border-slate-300 px-1 py-1 text-center text-sm focus:border-blue-500 focus:outline-none sm:w-14"
                placeholder="页码"
                aria-label="跳转到页码"
              />
              <button
                onClick={goJump}
                className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:text-slate-800"
              >
                跳转
              </button>
            </div>
          </div>
          <button
            onClick={() => go(page + 1)}
            disabled={page >= lastPage}
            className="flex min-w-[70px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white sm:min-w-[90px] sm:px-4"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
