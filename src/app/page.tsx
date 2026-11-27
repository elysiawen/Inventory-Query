"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, displayNameOf, getStoredUser, getToken, logout, logoutRemote, refreshStoredUser } from "@/lib/api";
import { Pagination, inputCls, Loading, Modal } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";

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
  const { confirm } = useConfirm();
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // 完整筛选卡片滚出视野后，浮出固定搜索条（固定定位不占布局，避免滚动跳动）
  const [compactShown, setCompactShown] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // 搜索结果上的出入库弹窗
  const [stockTarget, setStockTarget] = useState<{
    item: SearchItem;
    type: "IN" | "OUT";
  } | null>(null);
  const [stockQty, setStockQty] = useState("1");
  const [stockRemark, setStockRemark] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
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
    // 访问哪里就停在哪里：管理员打开根目录也留在前台搜索页
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

  // 完整筛选卡片完全滚出视口后浮出固定搜索条；滚回时收起并关闭高级面板
  useEffect(() => {
    if (!authorized) return;
    function onScroll() {
      const el = filterRef.current;
      if (!el) return;
      const shown = el.getBoundingClientRect().bottom <= 0;
      setCompactShown(shown);
      if (!shown) setAdvancedOpen(false);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [authorized]);

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
    setAdvancedOpen(false);
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
  async function handleLogout() {
    const ok = await confirm("退出后需要重新登录才能继续使用，确定退出吗？", {
      title: "退出登录",
      confirmText: "退出",
      confirmColor: "red",
    });
    if (!ok) return;
    await logoutRemote();
    logout();
    router.replace("/login");
  }

  function openStock(item: SearchItem, type: "IN" | "OUT") {
    setStockTarget({ item, type });
    setStockQty("1");
    setStockRemark("");
  }

  async function submitStock() {
    if (!stockTarget || stockBusy) return;
    const qty = Number(stockQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("请输入大于 0 的整数数量");
      return;
    }
    if (stockTarget.type === "OUT" && qty > stockTarget.item.quantity) {
      toast.error(`出库数量不能超过当前库存 ${stockTarget.item.quantity}`);
      return;
    }
    setStockBusy(true);
    try {
      const path = stockTarget.type === "IN" ? "stock-in" : "stock-out";
      await api.post(`/api/items/${stockTarget.item.id}/${path}`, {
        quantity: qty,
        remark: stockRemark.trim() || undefined,
      });
      toast.success(stockTarget.type === "IN" ? "入库成功" : "出库成功");
      setStockTarget(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStockBusy(false);
    }
  }

  const displayName = displayNameOf(user);
  const isAdmin = user?.role === "ADMIN";
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";

  // 已填写的尺寸条件数量，收起时也能一眼看出有没有生效
  const advancedCount = DIMS.filter((d) => {
    const v = dims[d.key];
    return v.mode === "exact" ? v.exact !== "" : v.min !== "" || v.max !== "";
  }).length;

  // 手机端分类胶囊：完整筛选卡片与吸顶条高级面板共用，样式对齐小程序
  const renderCategoryChips = (className = "") => (
    <div
      className={`-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="flex w-max gap-1.5 px-1 py-0.5">
        <button
          type="button"
          onClick={() => setCategoryId("")}
          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
            categoryId === ""
              ? "bg-blue-600 font-semibold text-white"
              : "bg-slate-100 text-slate-600 active:bg-slate-200"
          }`}
        >
          全部分类
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
              categoryId === c.id
                ? "bg-blue-600 font-semibold text-white"
                : "bg-slate-100 text-slate-600 active:bg-slate-200"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );

  // 三个尺寸输入组：完整筛选和收起后的高级面板共用
  const renderDimInputs = () => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
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
  );

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
              <span className="max-w-[120px] truncate sm:max-w-[200px]">{displayName}</span>
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
                  onClick={() => void handleLogout()}
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
        {/* 顶部完整筛选卡片：正常流布局，滚出视野后由下面的固定搜索条接管 */}
        <div
          ref={filterRef}
          className="mb-4 rounded-xl border border-slate-200 bg-white p-3 sm:mb-6 sm:p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className={`${inputCls} w-full sm:min-w-0 sm:flex-1`}
              placeholder="关键词（名称 / 型号）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
            />
            {/* 手机端分类用胶囊横向滚动，样式对齐小程序；桌面端保留下拉 */}
            {renderCategoryChips("w-full sm:hidden")}
            <div className="hidden w-full shrink-0 sm:block sm:w-40">
              <select
                className={inputCls}
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
            <div className="flex gap-2">
              <button
                onClick={applySearch}
                className="flex-1 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-95 sm:flex-none"
              >
                查询
              </button>
              <button
                onClick={resetSearch}
                className="flex-1 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 sm:flex-none"
              >
                重置
              </button>
            </div>
          </div>

          <div className="mt-2.5">{renderDimInputs()}</div>
        </div>

        {/* 卡片滚出视野后浮出的固定搜索条：fixed 不占布局，避免高度变化引起滚动跳动 */}
        <div
          className={`fixed left-1/2 top-0 z-40 w-full max-w-6xl -translate-x-1/2 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur transition-all duration-200 ease-out sm:rounded-b-xl sm:border-x ${
            compactShown
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-full opacity-0"
          }`}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
            <input
              className={`${inputCls} min-w-0 flex-1`}
              placeholder="关键词（名称 / 型号）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
            />
            {/* 宽度放在外层：inputCls 自带 w-full，同级再写 w-[92px] 会因产物中样式顺序不确定而失效 */}
            <div className="hidden w-full shrink-0 sm:block sm:w-40">
              <select
                className={inputCls}
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
            <button
              onClick={applySearch}
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-95"
            >
              查询
            </button>
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition ${
                advancedOpen || advancedCount > 0
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              高级
              {advancedCount > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                  {advancedCount}
                </span>
              )}
            </button>
          </div>

          {advancedOpen && (
            <div className="max-h-[70vh] overflow-y-auto border-t border-slate-100 bg-white px-4 pb-4 pt-3 sm:px-6">
              {/* 手机端分类收进高级面板，与小程序一致；桌面端用吸顶条的下拉 */}
              <div className="mb-3 sm:hidden">
                <div className="mb-1.5 text-xs text-slate-500">分类</div>
                {renderCategoryChips()}
              </div>
              {renderDimInputs()}

              <div className="mt-3 flex justify-end">
                <button
                  onClick={resetSearch}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  重置全部
                </button>
              </div>
            </div>
          )}
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

                    {isAdmin && (
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={() => openStock(item, "IN")}
                          className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition active:bg-blue-100"
                        >
                          入库
                        </button>
                        <button
                          onClick={() => openStock(item, "OUT")}
                          disabled={item.quantity <= 0}
                          className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          出库
                        </button>
                      </div>
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
                        {isAdmin && (
                          <div className="mt-2.5 flex gap-2">
                            <button
                              onClick={() => openStock(item, "IN")}
                              className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                            >
                              入库
                            </button>
                            <button
                              onClick={() => openStock(item, "OUT")}
                              disabled={item.quantity <= 0}
                              className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              出库
                            </button>
                          </div>
                        )}
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
                pageSizeOptions={[15, 30, 51]}
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

      <Modal
        open={!!stockTarget}
        onClose={() => !stockBusy && setStockTarget(null)}
        title={stockTarget?.type === "IN" ? "入库" : "出库"}
        width="max-w-sm"
        footer={
          <>
            <button
              onClick={() => setStockTarget(null)}
              disabled={stockBusy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={() => void submitStock()}
              disabled={stockBusy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {stockBusy ? "提交中…" : "确认"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-800">
              {stockTarget?.item.name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              型号 {stockTarget?.item.model} · 当前库存 {stockTarget?.item.quantity}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">数量</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              step={1}
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitStock()}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">备注（可选）</label>
            <input
              className={inputCls}
              value={stockRemark}
              maxLength={100}
              placeholder="选填，例如用途、领用人"
              onChange={(e) => setStockRemark(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitStock()}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
