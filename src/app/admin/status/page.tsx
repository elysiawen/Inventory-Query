"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { Loading, ErrorState } from "@/components/ui";

interface SystemStatus {
  db: { ok: boolean; latencyMs: number };
  counts: {
    users: number;
    categories: number;
    items: number;
    logs: number;
    stockQuantity: number;
  } | null;
  runtime: {
    node: string;
    env: string;
    uptimeSec: number;
    serverTime: string;
  };
  operator: string;
}

function formatUptime(totalSec: number) {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d} 天 ${h} 小时 ${m} 分`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

export default function StatusPage() {
  const toast = useToast();
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await api.get("/api/system/status")) as SystemStatus;
      setData(res);
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const ok = data?.db.ok ?? false;
  const counts = data?.counts;
  const stats = [
    { label: "用户", value: counts?.users },
    { label: "分类", value: counts?.categories },
    { label: "物品", value: counts?.items },
    { label: "流水", value: counts?.logs },
    { label: "库存总量", value: counts?.stockQuantity },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">系统状态</h2>
          <p className="mt-1 text-xs text-slate-400">数据库连接、运行信息与数据统计</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {!data ? (
        loading ? (
          <Loading />
        ) : (
          <ErrorState message={error || "加载失败"} onRetry={load} />
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">数据库连接</h3>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                  ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`}
                />
                {ok ? "正常" : "异常"}
              </span>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">响应延迟</dt>
                <dd className="font-medium text-slate-700">
                  {ok ? `${data.db.latencyMs} ms` : "-"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">当前登录</dt>
                <dd className="font-medium text-slate-700">{data.operator}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700">运行信息</h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Node 版本</dt>
                <dd className="font-medium text-slate-700">{data.runtime.node}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">运行环境</dt>
                <dd className="font-medium text-slate-700">{data.runtime.env}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">已运行</dt>
                <dd className="font-medium text-slate-700">
                  {formatUptime(data.runtime.uptimeSec)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">服务器时间</dt>
                <dd className="font-medium text-slate-700">
                  {new Date(data.runtime.serverTime).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-700">数据统计</h3>
            {counts ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-3 text-center">
                    <div className="text-xs text-slate-400">{s.label}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-800">
                      {s.value ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">数据库不可用，暂无统计数据</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
