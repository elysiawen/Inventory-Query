"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser, getToken, logout, refreshStoredUser } from "@/lib/api";
import { Pagination, inputCls, Loading } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

interface CategoryOption {
  id: string;
  name: string;
}

interface SearchItem {
  id: string;
  name: string;
  model: string;
  image: string | null;
  price: number;
  remark: string | null;
  supplier: string | null;
  innerDiameter: number;
  outerDiameter: number;
  height: number;
  quantity: number;
  category: { id: string; name: string };
}

interface PageData {
  data: SearchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type DimMode = "exact" | "range";
interface DimFilter {
  mode: DimMode;
  exact: string;
  min: string;
  max: string;
}
type DimKey = "inner" | "outer" | "height";

const emptyDim: DimFilter = { mode: "exact", exact: "", min: "", max: "" };
const DIMS: { key: DimKey; label: string }[] = [
  { key: "inner", label: "内径/柄径" },
  { key: "outer", label: "外径" },
  { key: "height", label: "高度/总长" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "updatedAt", label: "更新时间" },
  { value: "name", label: "名称" },
  { value: "innerDiameter", label: "内径/柄径" },
  { value: "outerDiameter", label: "外径" },
  { value: "height", label: "高度/总长" },
  { value: "price", label: "价格" },
  { value: "quantity", label: "库存" },
];

export default function SearchPage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState(getStoredUser());
  const [data, setData] = useState<PageData | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [authorized, setAuthorized] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dims, setDims] = useState<Record<DimKey, DimFilter>>({
    inner: emptyDim,
    outer: emptyDim,
    height: emptyDim,
  });
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);
  const [applied, setApplied] = useState({
    keyword: "",
    categoryId: "",
    dims: { inner: emptyDim, outer: emptyDim, height: emptyDim } as Record<DimKey, DimFilter>,
    sortBy: "updatedAt",
    sortOrder: "desc" as "asc" | "desc",
  });

  // 登录守卫：校验通过前不渲染页面内容，避免未登录时闪现首页
  useEffect(() => {
    const u = getStoredUser();
    if (!getToken() || !u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setAuthorized(true);
  }, [router]);

  // 同步管理员修改过的用户名/角色，刷新页面即可看到最新信息
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    refreshStoredUser().then((u) => {
      if (!cancelled && u) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  // 下拉菜单改用点击展开，触屏设备没有 hover 也能打开
  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  const load = useCallback(async () => {
    // 请求序号：只应用最后一次请求的结果，避免慢网下旧响应覆盖新结果
    const mySeq = ++reqSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (applied.keyword) params.set("keyword", applied.keyword);
      if (applied.categoryId) params.set("categoryId", applied.categoryId);
      const appendDim = (key: string, dim: DimFilter) => {
        if (dim.mode === "exact") {
          if (dim.exact) params.set(`${key}Exact`, dim.exact);
        } else {
          if (dim.min) params.set(`${key}Min`, dim.min);
          if (dim.max) params.set(`${key}Max`, dim.max);
        }
      };
      appendDim("inner", applied.dims.inner);
      appendDim("outer", applied.dims.outer);
      appendDim("height", applied.dims.height);
      params.set("sortBy", applied.sortBy);
      params.set("sortOrder", applied.sortOrder);
      const res = (await api.get(`/api/items/search?${params.toString()}`)) as PageData;
      if (mySeq !== reqSeq.current) return;
      setData(res);
    } catch (e) {
      if (mySeq === reqSeq.current) toast.error((e as Error).message);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, [page, pageSize, applied, toast]);

  useEffect(() => {
    if (authorized) load();
  }, [authorized, load]);

  useEffect(() => {
    if (!authorized) return;
    api
      .get("/api/categories")
      .then((res) => setCategories(res as CategoryOption[]))
      .catch((e) => toast.error((e as Error).message));
  }, [authorized, toast]);

  function applySearch() {
    // 范围筛选先校验，避免最小值大于最大值时静默返回空结果
    const dimEntries: [string, DimFilter][] = [
      ["内径/柄径", dims.inner],
      ["外径", dims.outer],
      ["高度/总长", dims.height],
    ];
    for (const [label, dim] of dimEntries) {
      if (
        dim.mode === "range" &&
        dim.min !== "" &&
        dim.max !== "" &&
        Number(dim.min) > Number(dim.max)
      ) {
        toast.error(`${label}的最小值不能大于最大值`);
        return;
      }
    }
    setPage(1);
    setApplied({ keyword, categoryId, dims, sortBy, sortOrder });
  }
  function applySort(field: string, order: "asc" | "desc") {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
    setApplied((prev) => ({ ...prev, sortBy: field, sortOrder: order }));
  }
  function resetSearch() {
    setKeyword("");
    setCategoryId("");
    setDims({ inner: emptyDim, outer: emptyDim, height: emptyDim });
    setSortBy("updatedAt");
    setSortOrder("desc");
    setPage(1);
    setApplied({
      keyword: "",
      categoryId: "",
      dims: { inner: emptyDim, outer: emptyDim, height: emptyDim },
      sortBy: "updatedAt",
      sortOrder: "desc",
    });
  }
  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const avatarLetter = user?.username ? user.username.charAt(0).toUpperCase() : "?";

  if (!authorized) {
    return <Loading fullScreen text="正在验证登录状态…" />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h1 className="text-lg font-bold text-slate-800">库存查询</h1>
            <p className="text-xs text-slate-400">Inventory Query</p>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                {user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  avatarLetter
                )}
              </span>
              <span>{user?.username}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div
              className={`absolute right-0 top-full z-50 pt-2 transition-all duration-150 ${
                menuOpen ? "visible opacity-100" : "invisible opacity-0"
              }`}
            >
              <div className="w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  个人资料
                </Link>
                {user?.role === "ADMIN" && (
                  <Link
                    href="/admin/items"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
                    进入后台
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 transition hover:bg-red-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        {/* 筛选区 */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 sm:mb-6 sm:p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="w-full sm:min-w-[200px] sm:flex-1">
              <span className="mb-1 hidden text-xs text-slate-500 sm:block">关键词（名称 / 型号）</span>
              <input
                className={inputCls}
                placeholder="关键词（名称 / 型号）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
              />
            </div>
            <div className="w-full sm:w-auto">
              <span className="mb-1 hidden text-xs text-slate-500 sm:block">分类</span>
              <select
                className={`${inputCls} sm:w-48`}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">全部分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <button
                onClick={applySearch}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                查询
              </button>
              <button
                onClick={resetSearch}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                重置
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
            {DIMS.map((d) => {
              const dim = dims[d.key];
              const setDim = (patch: Partial<DimFilter>) =>
                setDims((prev) => ({ ...prev, [d.key]: { ...prev[d.key], ...patch } }));
              return (
                <div key={d.key} className="flex items-center gap-1.5">
                  <span className="flex w-[78px] shrink-0 items-baseline gap-0.5 whitespace-nowrap text-xs text-slate-500">
                    {d.label}
                    <span className="text-[10px] text-slate-400">mm</span>
                  </span>
                  {dim.mode === "exact" ? (
                    <>
                      <input
                        className={`${inputCls} min-w-0 flex-1`}
                        type="number"
                        step="0.01"
                        placeholder="精确值"
                        value={dim.exact}
                        onChange={(e) => setDim({ exact: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && applySearch()}
                      />
                      <button
                        type="button"
                        onClick={() => setDim({ mode: "range" })}
                        className="shrink-0 px-1 text-[11px] text-blue-600 hover:text-blue-700"
                      >
                        范围
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className={`${inputCls} min-w-0 flex-1`}
                        type="number"
                        step="0.01"
                        placeholder="最小"
                        value={dim.min}
                        onChange={(e) => setDim({ min: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && applySearch()}
                      />
                      <span className="shrink-0 text-slate-400">~</span>
                      <input
                        className={`${inputCls} min-w-0 flex-1`}
                        type="number"
                        step="0.01"
                        placeholder="最大"
                        value={dim.max}
                        onChange={(e) => setDim({ max: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && applySearch()}
                      />
                      <button
                        type="button"
                        onClick={() => setDim({ mode: "exact" })}
                        className="shrink-0 px-1 text-[11px] text-blue-600 hover:text-blue-700"
                      >
                        精确
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <Loading />
        ) : !data || data.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600">未找到符合条件的物品</p>
            <p className="mt-1 text-xs text-slate-400">试试更换关键词或放宽尺寸条件</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-500">
                共 <span className="font-semibold text-slate-800">{data.total}</span> 条结果
              </span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">排序：</span>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                  value={sortBy}
                  onChange={(e) => applySort(e.target.value, sortOrder)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    applySort(sortBy, sortOrder === "asc" ? "desc" : "asc")
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-50"
                  title="切换升降序"
                >
                  {sortOrder === "asc" ? "升序 ↑" : "降序 ↓"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data.data.map((item) => (
                <Fragment key={item.id}>
                  {/* 移动端：横向紧凑卡片 */}
                  <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md md:hidden">
                    <div className="flex gap-3">
                      <div
                        className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ${
                          item.image
                            ? "border border-slate-200"
                            : "border border-dashed border-slate-300"
                        }`}
                      >
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">无图</span>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate text-base font-semibold text-slate-800">
                            {item.name}
                          </h3>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              item.quantity <= 0
                                ? "bg-red-50 text-red-600"
                                : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {item.quantity <= 0 ? "缺货" : `库存 ${item.quantity}`}
                          </span>
                        </div>
                        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                          <span className="truncate">型号 {item.model}</span>
                          {item.supplier && (
                            <>
                              <span className="h-3 w-px shrink-0 bg-slate-200" />
                              <span className="truncate">{item.supplier}</span>
                            </>
                          )}
                        </p>
                        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                          <span className="truncate">{item.category.name}</span>
                          <span className="h-3 w-px shrink-0 bg-slate-200" />
                          <span className="shrink-0 font-medium text-slate-700">
                            ¥{Number(item.price).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-1.5 text-center">
                      <div className="min-w-0 px-1">
                        <p className="truncate text-[10px] text-slate-400">内径/柄径 (mm)</p>
                        <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
                          {item.innerDiameter}
                        </p>
                      </div>
                      <div className="min-w-0 px-1">
                        <p className="truncate text-[10px] text-slate-400">外径 (mm)</p>
                        <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
                          {item.outerDiameter}
                        </p>
                      </div>
                      <div className="min-w-0 px-1">
                        <p className="truncate text-[10px] text-slate-400">高度/总长 (mm)</p>
                        <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
                          {item.height}
                        </p>
                      </div>
                    </div>

                    {item.remark && (
                      <p className="mt-2 line-clamp-1 text-xs text-slate-400">
                        备注：{item.remark}
                      </p>
                    )}
                  </div>

                  {/* 桌面端：纵向卡片 */}
                  <div className="hidden flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg md:flex">
                    <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full object-contain p-3"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">无图</span>
                      )}
                      <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] text-slate-500 shadow-sm">
                        {item.category.name}
                      </span>
                      {item.quantity <= 0 && (
                        <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white">
                          缺货
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="truncate font-semibold text-slate-800">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                        <span className="truncate">型号 {item.model}</span>
                        {item.supplier && (
                          <>
                            <span className="h-3 w-px shrink-0 bg-slate-300" />
                            <span className="truncate">供应商 {item.supplier}</span>
                          </>
                        )}
                      </p>

                      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-1.5 text-center">
                        <div className="min-w-0 px-1">
                          <p className="truncate text-[10px] text-slate-400">内径/柄径 (mm)</p>
                          <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
                            {item.innerDiameter}
                          </p>
                        </div>
                        <div className="min-w-0 px-1">
                          <p className="truncate text-[10px] text-slate-400">外径 (mm)</p>
                          <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
                            {item.outerDiameter}
                          </p>
                        </div>
                        <div className="min-w-0 px-1">
                          <p className="truncate text-[10px] text-slate-400">高度/总长 (mm)</p>
                          <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
                            {item.height}
                          </p>
                        </div>
                      </div>

                      {item.remark && (
                        <p className="mt-2 line-clamp-1 text-xs text-slate-400">
                          备注：{item.remark}
                        </p>
                      )}

                      <div className="mt-auto pt-3">
                        <div className="flex items-end justify-between border-t border-slate-100 pt-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                item.quantity <= 0 ? "bg-red-500" : "bg-green-500"
                              }`}
                            />
                            <span className="text-slate-400">库存</span>
                            <span
                              className={`font-semibold ${
                                item.quantity <= 0 ? "text-red-500" : "text-slate-700"
                              }`}
                            >
                              {item.quantity}
                            </span>
                          </div>
                          <div className="text-lg font-semibold leading-none text-blue-600">
                            <span className="mr-0.5 text-xs font-normal text-blue-500">¥</span>
                            {Number(item.price).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="mt-6">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                pageSizeOptions={[15, 30, 50]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onChange={(p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
