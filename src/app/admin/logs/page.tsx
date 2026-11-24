"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Pagination, inputCls, Loading, ErrorState } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

interface StockLogRow {
  id: string;
  type: "IN" | "OUT";
  quantity: number;
  remark: string | null;
  createdAt: string;
  item: { id: string; name: string; model: string };
  operator: { id: string; username: string };
}

interface ItemOption {
  id: string;
  name: string;
  model: string;
}

interface PageData {
  data: StockLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function itemLabel(item: ItemOption) {
  return `${item.name} (${item.model})`;
}

/** 物品远程搜索下拉：按关键字查询前 20 条，避免一次性加载全部物品 */
function ItemPicker({ onChange }: { onChange: (itemId: string) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ItemOption | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const fetchOptions = useCallback(
    async (kw: string) => {
      const mySeq = ++seq.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: "20" });
        if (kw) params.set("keyword", kw);
        const res = (await api.get(`/api/items?${params.toString()}`)) as {
          data: ItemOption[];
        };
        if (mySeq === seq.current) setOptions(res.data);
      } catch (e) {
        if (mySeq === seq.current) toast.error((e as Error).message);
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void fetchOptions(keyword.trim()), 250);
    return () => clearTimeout(timer);
  }, [open, keyword, fetchOptions]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        // 关闭时恢复为当前筛选状态对应的文本
        setKeyword(selected ? itemLabel(selected) : "");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, selected]);

  function pick(item: ItemOption | null) {
    setSelected(item);
    setKeyword(item ? itemLabel(item) : "");
    setOpen(false);
    onChange(item ? item.id : "");
  }

  return (
    <div className="w-full sm:w-auto" ref={boxRef}>
      <span className="mb-1 block text-xs text-slate-500">物品</span>
      <div className="relative">
        <input
          className={`${inputCls} pr-8 sm:w-64`}
          placeholder="输入名称或型号搜索"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            if (selected) {
              setSelected(null);
              onChange("");
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setKeyword(selected ? itemLabel(selected) : "");
            }
          }}
        />
        {selected && (
          <button
            type="button"
            aria-label="清除物品筛选"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => pick(null)}
          >
            ×
          </button>
        )}
        {open && (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              onClick={() => pick(null)}
            >
              全部物品
            </button>
            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-400">搜索中…</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">未找到匹配物品</div>
            ) : (
              options.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    selected?.id === it.id ? "bg-blue-50 text-blue-700" : "text-slate-700"
                  }`}
                  onClick={() => pick(it)}
                >
                  <span className="block truncate">{it.name}</span>
                  <span className="block truncate text-xs text-slate-400">{it.model}</span>
                </button>
              ))
            )}
            {!loading && options.length === 20 && (
              <div className="px-3 py-1.5 text-xs text-slate-400">
                仅显示前 20 条，可继续输入关键字缩小范围
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LogsPage() {
  const toast = useToast();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ itemId: "", from: "", to: "" });
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    // 请求序号：只应用最后一次请求的结果，避免慢网下旧响应覆盖新结果
    const mySeq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (filters.itemId) params.set("itemId", filters.itemId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const res = (await api.get(`/api/stock-logs?${params.toString()}`)) as PageData;
      if (mySeq !== reqSeq.current) return;
      setData(res);
    } catch (e) {
      if (mySeq !== reqSeq.current) return;
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, [page, pageSize, filters, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters() {
    // 已在第 1 页时页码不会变化，需手动重新请求
    if (page !== 1) setPage(1);
    else load();
  }

  /** 筛选条件变化后立即回到第一页，避免停留在超出范围的高页码上 */
  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-slate-800">流水记录</h2>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <ItemPicker onChange={(itemId) => updateFilters({ itemId })} />
        <div className="grid w-full grid-cols-2 gap-3 sm:contents">
          <div className="sm:w-auto">
            <span className="mb-1 block text-xs text-slate-500">开始时间</span>
            <input
              type="date"
              className={`${inputCls} sm:w-40`}
              value={filters.from}
              onChange={(e) => updateFilters({ from: e.target.value })}
            />
          </div>
          <div className="sm:w-auto">
            <span className="mb-1 block text-xs text-slate-500">结束时间</span>
            <input
              type="date"
              className={`${inputCls} sm:w-40`}
              value={filters.to}
              onChange={(e) => updateFilters({ to: e.target.value })}
            />
          </div>
        </div>
        <button
          onClick={applyFilters}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 sm:w-auto"
        >
          查询
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {!data || data.data.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
                暂无流水记录
              </div>
            ) : (
              data.data.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{log.item.name}</div>
                      <div className="truncate text-xs text-slate-400">{log.item.model}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        log.type === "IN"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {log.type === "IN" ? "入库" : "出库"} {log.type === "IN" ? "+" : "-"}
                      {log.quantity}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                    <span>{log.operator.username}</span>
                  </div>
                  {log.remark && (
                    <div className="mt-1 text-xs text-slate-500">备注：{log.remark}</div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">物品</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">数量</th>
                  <th className="px-4 py-3">操作人</th>
                  <th className="px-4 py-3">备注</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      暂无流水记录
                    </td>
                  </tr>
                ) : (
                  data.data.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {log.item.name}
                        <span className="ml-1 text-slate-400">({log.item.model})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            log.type === "IN"
                              ? "bg-green-100 text-green-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {log.type === "IN" ? "入库" : "出库"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {log.type === "IN" ? "+" : "-"}
                        {log.quantity}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{log.operator.username}</td>
                      <td className="px-4 py-3 text-slate-500">{log.remark || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              pageSizeOptions={[10, 30, 50]}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
