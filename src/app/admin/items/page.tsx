"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Modal, Field, inputCls, Pagination, Loading, Spinner, ErrorState } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";

interface CategoryOption {
  id: string;
  name: string;
}

interface ItemRow {
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
  data: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ImportDuplicate {
  row: number;
  category: string;
  name: string;
  model: string;
  currentQuantity: number;
  currentPrice: number;
}

interface ImportCompound {
  row: number;
  name: string;
  model: string;
  raw: string;
  parsed: { innerDiameter: number; outerDiameter: number; height: number };
  extraHeights: number[];
  heights: number[];
  quantities: number[];
  labels: string[];
}

interface ImportPreviewRow {
  row: number;
  category: string;
  name: string;
  model: string;
  price: number;
  quantities: number[];
  heights: number[];
  labels: string[];
  innerDiameter: number;
  outerDiameter: number;
  compound: boolean;
  remark: string | null;
}

interface ImportReport {
  total: number;
  valid: number;
  rows: ImportPreviewRow[];
  duplicates: ImportDuplicate[];
  compounds: ImportCompound[];
  invalid: { row: number; reason: string }[];
  newCategories: string[];
}

interface ImportOptions {
  duplicates: "skip" | "update" | "create";
  compound: "first" | "split" | "skip";
  invalid: "abort" | "skip";
}

interface PlannedVariant {
  /** 变体展示名：复合规格为「开（高 2）」，普通规格为「内径×外径×高」 */
  title: string;
  quantity: number | null;
}

interface PlannedItem {
  row: number;
  category: string;
  name: string;
  model: string;
  price: number;
  action: "create" | "update" | "skip";
  skipReason?: string;
  variants: PlannedVariant[];
}

const emptyForm = {
  name: "",
  model: "",
  categoryId: "",
  image: "",
  price: "",
  remark: "",
  supplier: "",
  innerDiameter: "",
  outerDiameter: "",
  height: "",
  quantity: "",
};

export default function ItemsPage() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<PageData | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 表单会话标识：上传图片跨弹窗时只把结果写回发起时的那个表单
  const formSession = useRef(0);

  const [stockOpen, setStockOpen] = useState(false);
  const [stockItem, setStockItem] = useState<ItemRow | null>(null);
  const [stockType, setStockType] = useState<"IN" | "OUT">("IN");
  const [stockQty, setStockQty] = useState("");
  const [stockRemark, setStockRemark] = useState("");
  const [stockSaving, setStockSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    duplicates: "skip",
    compound: "first",
    invalid: "abort",
  });
  const [splitQty, setSplitQty] = useState<Record<number, string[]>>({});
  // 导入分两步：1 选择表格与处理策略，2 核对明细后提交
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    // 请求序号：只应用最后一次请求的结果，避免慢网下旧响应覆盖新结果
    const mySeq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (appliedKeyword) params.set("keyword", appliedKeyword);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      const res = (await api.get(`/api/items?${params.toString()}`)) as PageData;
      if (mySeq !== reqSeq.current) return;
      setData(res);
    } catch (e) {
      if (mySeq !== reqSeq.current) return;
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, [page, pageSize, appliedKeyword, categoryFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/api/categories")
      .then((res) => setCategories(res as CategoryOption[]))
      .catch((e) => toast.error((e as Error).message));
  }, [toast]);

  function submitSearch() {
    setPage(1);
    setAppliedKeyword(keyword.trim());
  }

  function closeForm() {
    // 上传中不允许关闭，避免文件上传完成时表单已切换到别的记录
    if (uploading) return;
    setFormOpen(false);
    formSession.current += 1;
  }
  function openCreate() {
    if (categories.length === 0) {
      toast.info("请先在「分类管理」中创建分类");
      return;
    }
    formSession.current += 1;
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories[0].id });
    setFormOpen(true);
  }
  function openEdit(item: ItemRow) {
    formSession.current += 1;
    setEditing(item);
    setForm({
      name: item.name,
      model: item.model,
      categoryId: item.category.id,
      image: item.image || "",
      price: String(item.price),
      remark: item.remark || "",
      supplier: item.supplier || "",
      innerDiameter: String(item.innerDiameter),
      outerDiameter: String(item.outerDiameter),
      height: String(item.height),
      quantity: String(item.quantity),
    });
    setFormOpen(true);
  }
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 清空选择值，上传失败后可以重新选择同一张图片
    e.target.value = "";
    if (!file) return;
    const session = formSession.current;
    setUploading(true);
    try {
      const res = (await api.upload("/api/upload", file)) as { url: string };
      if (formSession.current !== session) return;
      // 用函数式更新，避免上传期间用户改动的其他字段被旧快照覆盖
      setForm((prev) => ({ ...prev, image: res.url }));
    } catch (err) {
      if (formSession.current === session) toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function handleSave() {
    if (!form.name.trim() || !form.model.trim() || !form.categoryId) {
      toast.error("名称、型号、分类为必填项");
      return;
    }
    if (!editing) {
      const qty = Number(form.quantity);
      if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000_000) {
        toast.error("初始数量必须是 0 到 1000000000 的整数");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price) || 0,
        innerDiameter: Number(form.innerDiameter) || 0,
        outerDiameter: Number(form.outerDiameter) || 0,
        height: Number(form.height) || 0,
        quantity: editing ? undefined : Number(form.quantity),
      };
      if (editing) await api.put(`/api/items/${editing.id}`, payload);
      else await api.post("/api/items", payload);
      setFormOpen(false);
      formSession.current += 1;
      toast.success(editing ? "保存成功" : "上架成功");
      // 新增后回到第 1 页，最新上架的物品按更新时间倒序就在首位
      if (!editing && page !== 1) setPage(1);
      else load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete(item: ItemRow) {
    const ok = await confirm(`确定删除物品「${item.name}」吗？`, {
      title: "删除物品",
      confirmText: "删除",
      confirmColor: "red",
    });
    if (!ok) return;
    try {
      await api.delete(`/api/items/${item.id}`);
      toast.success("删除成功");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function openStock(item: ItemRow, type: "IN" | "OUT") {
    setStockItem(item);
    setStockType(type);
    setStockQty("");
    setStockRemark("");
    setStockOpen(true);
  }
  async function handleStock() {
    const qty = Number(stockQty);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000_000) {
      toast.error("请输入 1 到 1000000000 之间的整数数量");
      return;
    }
    if (!stockItem) return;
    setStockSaving(true);
    try {
      const endpoint =
        stockType === "IN"
          ? `/api/items/${stockItem.id}/stock-in`
          : `/api/items/${stockItem.id}/stock-out`;
      await api.post(endpoint, { quantity: qty, remark: stockRemark || undefined });
      setStockOpen(false);
      toast.success(stockType === "IN" ? "入库成功" : "出库成功");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStockSaving(false);
    }
  }

  function openImport() {
    setImportOpen(true);
    setImportStep(1);
    setImportFile(null);
    setImportReport(null);
    setImportOptions({ duplicates: "skip", compound: "first", invalid: "abort" });
    setSplitQty({});
  }
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 清空选择值，失败后可以重新选择同一个文件
    e.target.value = "";
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("只支持 .xlsx 格式的表格");
      return;
    }
    setImportParsing(true);
    setImportStep(1);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dryRun", "1");
      const res = (await api.uploadForm("/api/items/import", form)) as { report: ImportReport };
      setImportFile(file);
      setImportReport(res.report);
      // 表格里写了多个数量（如 20/10）时预填，否则留空由用户按变体填写
      const nextSplit: Record<number, string[]> = {};
      for (const c of res.report.compounds) {
        nextSplit[c.row] =
          c.quantities.length === c.heights.length ? c.quantities.map(String) : c.heights.map(() => "");
      }
      setSplitQty(nextSplit);
    } catch (err) {
      setImportFile(null);
      setImportReport(null);
      setSplitQty({});
      toast.error((err as Error).message);
    } finally {
      setImportParsing(false);
    }
  }
  async function handleImport() {
    if (!importFile || !importReport || importing) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      form.append("dryRun", "0");
      const payload: ImportOptions & { quantities?: Record<string, number[]> } = {
        ...importOptions,
      };
      if (importOptions.compound === "split") {
        // 留空的行不提交，服务端会回落到表格里写的数量（如 20/10）或给出提示
        const quantities: Record<string, number[]> = {};
        for (const [row, values] of Object.entries(splitQty)) {
          if (values.some((v) => v.trim() === "")) continue;
          quantities[row] = values.map((v) => Number(v));
        }
        payload.quantities = quantities;
      }
      form.append("options", JSON.stringify(payload));
      const res = (await api.uploadForm("/api/items/import", form)) as {
        created: number;
        updated: number;
        skipped: number;
        newCategories: string[];
      };
      toast.success(`导入完成：新增 ${res.created}，更新 ${res.updated}，跳过 ${res.skipped}`);
      setImportOpen(false);
      if (res.newCategories.length > 0) {
        api
          .get("/api/categories")
          .then((list) => setCategories(list as CategoryOption[]))
          .catch(() => undefined);
      }
      if (page !== 1) setPage(1);
      else load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  // 选择拆分时，必须为真正会写入的变体填好合法的库存数量才能导入；
  // 重复项选择「跳过」时整行不会写入，无需填写数量
  const skippedDuplicateRows = new Set(
    importOptions.duplicates === "skip" ? (importReport?.duplicates ?? []).map((d) => d.row) : [],
  );
  const splitReady =
    !importReport ||
    importOptions.compound !== "split" ||
    importReport.compounds
      .filter((c) => !skippedDuplicateRows.has(c.row))
      .every((c) => {
        const values = splitQty[c.row] ?? [];
        return (
          values.length === c.heights.length &&
          values.every((v) => /^\d+$/.test(v.trim()) && Number(v) <= 1_000_000_000)
        );
      });

  // 本次导入明细：按当前选项与填写数量，列出真正会新增 / 更新 / 跳过的每条物品
  const planned = useMemo<PlannedItem[]>(() => {
    if (!importReport) return [];
    const duplicateRows = new Set(importReport.duplicates.map((d) => d.row));
    return (importReport.rows ?? []).map((r) => {
      const base = {
        row: r.row,
        category: r.category,
        name: r.name,
        model: r.model,
        price: r.price,
      };
      if (r.compound && importOptions.compound === "skip") {
        return { ...base, action: "skip", skipReason: "复合规格，选择跳过", variants: [] };
      }
      const isDuplicate = duplicateRows.has(r.row);
      if (isDuplicate && importOptions.duplicates === "skip") {
        return { ...base, action: "skip", skipReason: "重复项，选择跳过", variants: [] };
      }
      const split = r.compound && importOptions.compound === "split";
      const heights = split ? r.heights : [r.heights[0]];
      const filled = splitQty[r.row] ?? [];
      const variants: PlannedVariant[] = heights.map((height, index) => {
        let quantity: number | null = null;
        if (!split) {
          quantity = r.quantities[0] ?? null;
        } else if (filled.length === heights.length && /^\d+$/.test((filled[index] ?? "").trim())) {
          quantity = Number(filled[index]);
        } else if (r.quantities.length === heights.length) {
          quantity = r.quantities[index];
        }
        return {
          // 复合规格各变体只差高度，显示简称+高度；普通规格显示完整尺寸
          title: r.compound
            ? `${r.labels[index] ?? `第 ${index + 1} 组`}（高 ${height}）`
            : `${r.innerDiameter}×${r.outerDiameter}×${height}`,
          quantity,
        };
      });
      return { ...base, action: isDuplicate ? "update" : "create", variants };
    });
  }, [importReport, importOptions.compound, importOptions.duplicates, splitQty]);

  const planTotals = useMemo(() => {
    let create = 0;
    let update = 0;
    let skip = 0;
    for (const item of planned) {
      if (item.action === "skip") skip += 1;
      else if (item.action === "create") create += item.variants.length;
      else update += item.variants.length;
    }
    return { create, update, skip };
  }, [planned]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">物品管理</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={openImport}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            导入表格
          </button>
          <button
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 上架物品
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-8 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="搜索物品名称或型号…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch();
            }}
          />
          {keyword && (
            <button
              onClick={() => {
                setKeyword("");
                setAppliedKeyword("");
                setPage(1);
              }}
              aria-label="清空关键词"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} w-full sm:w-40`}
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={submitSearch}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto"
        >
          搜索
        </button>
        {data && (
          <span className="text-xs text-slate-400 sm:ml-auto">
            共 {data.total} 件物品
          </span>
        )}
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
                暂无物品，点击右上角上架
              </div>
            ) : (
              data.data.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex gap-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-14 w-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                        无图
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">
                            {item.name}
                          </div>
                          <div className="truncate text-xs text-slate-400">{item.model}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {item.category.name}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        内径 {item.innerDiameter} × 外径 {item.outerDiameter} × 高{" "}
                        {item.height} mm
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="text-sm">
                      <span className="text-slate-400">库存 </span>
                      <span
                        className={`font-semibold ${
                          item.quantity <= 0 ? "text-red-500" : "text-slate-800"
                        }`}
                      >
                        {item.quantity}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-700">¥{item.price}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <button
                      onClick={() => openStock(item, "IN")}
                      className="rounded-lg bg-green-50 py-1.5 text-xs text-green-700 transition hover:bg-green-100"
                    >
                      入库
                    </button>
                    <button
                      onClick={() => openStock(item, "OUT")}
                      className="rounded-lg bg-orange-50 py-1.5 text-xs text-orange-700 transition hover:bg-orange-100"
                    >
                      出库
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded-lg border border-slate-300 py-1.5 text-xs text-blue-600 transition hover:bg-slate-50"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="rounded-lg border border-red-200 py-1.5 text-xs text-red-500 transition hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">图片</th>
                  <th className="px-4 py-3">名称 / 型号</th>
                  <th className="px-4 py-3">分类</th>
                  <th className="px-4 py-3">尺寸(mm)</th>
                  <th className="px-4 py-3">数量</th>
                  <th className="px-4 py-3">单价</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      暂无物品，点击右上角上架
                    </td>
                  </tr>
                ) : (
                  data.data.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-12 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                            无图
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{item.name}</div>
                        <div className="text-xs text-slate-400">{item.model}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.category.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="text-xs">
                          内径 {item.innerDiameter}
                        </div>
                        <div className="text-xs">
                          外径 {item.outerDiameter}
                        </div>
                        <div className="text-xs">高度 {item.height}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            item.quantity <= 0 ? "text-red-500" : "text-slate-800"
                          }`}
                        >
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">¥{item.price}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openStock(item, "IN")}
                          className="mr-2 rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
                        >
                          入库
                        </button>
                        <button
                          onClick={() => openStock(item, "OUT")}
                          className="mr-2 rounded bg-orange-50 px-2 py-1 text-xs text-orange-700 hover:bg-orange-100"
                        >
                          出库
                        </button>
                        <button
                          onClick={() => openEdit(item)}
                          className="mr-2 text-blue-600 hover:underline"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="text-red-500 hover:underline"
                        >
                          删除
                        </button>
                      </td>
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

      {/* 上架/编辑表单 */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? "编辑物品" : "上架物品"}
        width="max-w-2xl"
        footer={
          <>
            <button
              onClick={closeForm}
              disabled={uploading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="物品名称" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="型号" required>
            <input
              className={inputCls}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </Field>
          <Field label="分类" required>
            <select
              className={inputCls}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="单价">
            <input
              className={inputCls}
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              尺寸 (mm)
              <span className="ml-1 text-xs font-normal text-slate-400">
                内径/柄径 × 外径 × 高度/总长
              </span>
            </span>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500">
              <input
                className="min-w-0 flex-1 px-3 py-2 text-center text-sm focus:outline-none"
                type="number"
                step="0.01"
                placeholder="内径/柄径"
                value={form.innerDiameter}
                onChange={(e) => setForm({ ...form, innerDiameter: e.target.value })}
              />
              <span className="shrink-0 select-none px-1 text-slate-400">×</span>
              <input
                className="min-w-0 flex-1 px-3 py-2 text-center text-sm focus:outline-none"
                type="number"
                step="0.01"
                placeholder="外径"
                value={form.outerDiameter}
                onChange={(e) => setForm({ ...form, outerDiameter: e.target.value })}
              />
              <span className="shrink-0 select-none px-1 text-slate-400">×</span>
              <input
                className="min-w-0 flex-1 px-3 py-2 text-center text-sm focus:outline-none"
                type="number"
                step="0.01"
                placeholder="高度/总长"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
              />
            </div>
          </div>
          <Field label={editing ? "当前数量（通过出入库调整）" : "初始数量"}>
            <input
              className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-500`}
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              disabled={!!editing}
            />
          </Field>
          <Field label="供应商">
            <input
              className={inputCls}
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">图片</span>
            {form.image ? (
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.image}
                  alt="预览"
                  className="h-20 w-20 shrink-0 rounded-lg border border-slate-100 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-700">已上传图片</div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">{form.image}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50">
                    更换
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={handleUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, image: "" }))}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-50"
                  >
                    移除
                  </button>
                </div>
              </div>
            ) : (
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed bg-slate-50 px-4 py-4 transition ${
                  uploading
                    ? "pointer-events-none border-slate-200 opacity-70"
                    : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/60"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  {uploading ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-600">
                    {uploading ? "上传中…" : "点击上传图片"}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    支持 PNG / JPG / GIF / WEBP，不超过 5MB
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}
          </div>
          <div className="sm:col-span-2">
            <Field label="备注">
              <textarea
                className={inputCls}
                rows={2}
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>

      {/* 入库/出库 */}
      <Modal
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        title={
          stockItem
            ? `${stockType === "IN" ? "入库" : "出库"} - ${stockItem.name}`
            : "库存操作"
        }
        footer={
          <>
            <button
              onClick={() => setStockOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleStock}
              disabled={stockSaving}
              className={`rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50 ${
                stockType === "IN"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              {stockSaving ? "提交中…" : stockType === "IN" ? "确认入库" : "确认出库"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {stockItem && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              当前库存：<span className="font-semibold text-slate-800">{stockItem.quantity}</span>
            </div>
          )}
          <Field label="数量" required>
            <input
              className={inputCls}
              type="number"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="备注">
            <input
              className={inputCls}
              value={stockRemark}
              onChange={(e) => setStockRemark(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* 批量导入 */}
      <Modal
        open={importOpen}
        onClose={() => {
          if (!importing) setImportOpen(false);
        }}
        title={importStep === 1 ? "从 Excel 导入物品" : "核对导入明细"}
        width="max-w-2xl"
        footer={
          importStep === 1 ? (
            <>
              <button
                onClick={() => setImportOpen(false)}
                disabled={importing}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => setImportStep(2)}
                disabled={
                  !importReport ||
                  importReport.valid === 0 ||
                  importParsing ||
                  !splitReady ||
                  (importOptions.invalid === "abort" && (importReport?.invalid.length ?? 0) > 0)
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                下一步
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setImportStep(1)}
                disabled={importing}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                上一步
              </button>
              <button
                onClick={() => void handleImport()}
                disabled={importing || !splitReady}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? "导入中…" : "确认导入"}
              </button>
            </>
          )
        }
      >
        <input
          ref={importRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => void handleImportFile(e)}
        />
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
                importStep === 1 ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  importStep === 1 ? "bg-white/25" : "bg-blue-100"
                }`}
              >
                1
              </span>
              选择表格与策略
            </span>
            <span className="h-px flex-1 bg-slate-200" />
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
                importStep === 2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  importStep === 2 ? "bg-white/25" : "bg-white"
                }`}
              >
                2
              </span>
              核对明细
            </span>
          </div>

          {importStep === 1 && (
            <p className="text-xs text-slate-500">
              表格需包含列：类目、存货全名、规格（内径/柄径*外径*高度/总长）、型号、最低售价、库存数量、备注。仅支持 .xlsx，最大 5MB。
            </p>
          )}

          {importStep === 1 && importParsing && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-slate-500">
              <Spinner className="h-4 w-4" />
              正在解析表格…
            </div>
          )}

          {importStep === 1 && !importParsing && !importReport && (
            <button
              onClick={() => importRef.current?.click()}
              className="group flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-10 text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl leading-none shadow-sm ring-1 ring-slate-200 transition group-hover:ring-blue-200">
                ＋
              </span>
              <span className="text-sm font-medium">点击选择要导入的 .xlsx 文件</span>
              <span className="text-[11px] text-slate-400">
                请保持表头与模板一致，第一行不要留空
              </span>
            </button>
          )}

          {importReport && !importParsing && (
            <>
              {importStep === 1 && (
                <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                  <p className="text-[11px] text-slate-500">表格总行数</p>
                  <p className="mt-0.5 text-lg font-semibold leading-tight text-slate-800">
                    {importReport.total}
                  </p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                  <p className="text-[11px] text-blue-500">可导入</p>
                  <p className="mt-0.5 text-lg font-semibold leading-tight text-blue-700">
                    {importReport.valid}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
                  <p className="text-[11px] text-amber-600">重复项</p>
                  <p className="mt-0.5 text-lg font-semibold leading-tight text-amber-700">
                    {importReport.duplicates.length}
                  </p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    importReport.invalid.length > 0
                      ? "border-red-100 bg-red-50/60"
                      : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <p
                    className={`text-[11px] ${
                      importReport.invalid.length > 0 ? "text-red-500" : "text-slate-500"
                    }`}
                  >
                    不合法
                  </p>
                  <p
                    className={`mt-0.5 text-lg font-semibold leading-tight ${
                      importReport.invalid.length > 0 ? "text-red-600" : "text-slate-800"
                    }`}
                  >
                    {importReport.invalid.length}
                  </p>
                </div>
              </div>

              {importReport.newCategories.length > 0 && (
                <p className="text-xs text-slate-500">
                  将自动创建类目：{importReport.newCategories.join("、")}
                </p>
              )}

              {importReport.invalid.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-red-200">
                  <div className="flex items-center gap-2 bg-red-50 px-3 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    <p className="text-xs font-medium text-red-700">
                      不合法行 · {importReport.invalid.length} 行
                    </p>
                  </div>
                  <div className="space-y-1 px-3 py-2 text-xs text-slate-500">
                    {importReport.invalid.map((r) => (
                      <div key={r.row}>
                        第 {r.row} 行：{r.reason}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 border-t border-red-100 bg-white px-3 py-2.5">
                    <ImportOption
                      name="invalid"
                      value="abort"
                      checked={importOptions.invalid === "abort"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, invalid: v }))}
                    >
                      全部回滚：修正表格后再导入
                    </ImportOption>
                    <ImportOption
                      name="invalid"
                      value="skip"
                      checked={importOptions.invalid === "skip"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, invalid: v }))}
                    >
                      跳过错误行：只导入合法数据
                    </ImportOption>
                  </div>
                </div>
              )}

              {importReport.duplicates.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2 bg-amber-50 px-3 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <p className="text-xs font-medium text-amber-700">
                      已存在的物品 · {importReport.duplicates.length} 行
                    </p>
                  </div>
                  <div className="space-y-1 px-3 py-2 text-xs text-slate-500">
                    {importReport.duplicates.map((d) => (
                      <div key={d.row}>
                        第 {d.row} 行：{d.category} / {d.name} / {d.model}（当前库存{" "}
                        {d.currentQuantity}，单价 ¥{d.currentPrice}）
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 border-t border-amber-100 bg-white px-3 py-2.5">
                    <ImportOption
                      name="duplicates"
                      value="skip"
                      checked={importOptions.duplicates === "skip"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, duplicates: v }))}
                    >
                      跳过重复项（推荐）
                    </ImportOption>
                    <ImportOption
                      name="duplicates"
                      value="update"
                      checked={importOptions.duplicates === "update"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, duplicates: v }))}
                    >
                      用表格中的库存和售价覆盖已有记录
                    </ImportOption>
                    <ImportOption
                      name="duplicates"
                      value="create"
                      checked={importOptions.duplicates === "create"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, duplicates: v }))}
                    >
                      仍然新增一条
                    </ImportOption>
                  </div>
                </div>
              )}

              {importReport.compounds.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2 bg-amber-50 px-3 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <p className="text-xs font-medium text-amber-700">
                      复合规格行 · {importReport.compounds.length} 行
                    </p>
                  </div>
                  <div className="space-y-1.5 px-3 py-2 text-xs text-slate-500">
                    {importReport.compounds.map((c) => (
                      <div key={c.row} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-slate-400">第 {c.row} 行</span>
                        <span className="font-medium text-slate-600">{c.model}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          {c.raw}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          内径 {c.parsed.innerDiameter} · 外径 {c.parsed.outerDiameter} · 高{" "}
                          {c.parsed.height}
                          {c.extraHeights.length > 0 && ` · 另有高度 ${c.extraHeights.join("、")}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 border-t border-amber-100 bg-white px-3 py-2.5">
                    <ImportOption
                      name="compound"
                      value="first"
                      checked={importOptions.compound === "first"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, compound: v }))}
                    >
                      取第一组尺寸，原始规格写入备注（推荐）
                    </ImportOption>
                    <ImportOption
                      name="compound"
                      value="split"
                      checked={importOptions.compound === "split"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, compound: v }))}
                    >
                      按每组尺寸拆成多条物品
                    </ImportOption>
                    <ImportOption
                      name="compound"
                      value="skip"
                      checked={importOptions.compound === "skip"}
                      onChange={(v) => setImportOptions((prev) => ({ ...prev, compound: v }))}
                    >
                      跳过这些行
                    </ImportOption>
                  </div>

                  {importOptions.compound === "split" && (
                    <div className="border-t border-amber-100 bg-amber-50/40 px-3 py-3">
                      <p className="text-xs text-amber-700">
                        拆分后每个变体单独设置库存数量（表格数量列写成 20/10 会自动带入）：
                      </p>
                      <div className="mt-2 space-y-2">
                        {importReport.compounds.map((c) => (
                          <div
                            key={c.row}
                            className="rounded-lg border border-amber-100 bg-white px-2.5 py-2"
                          >
                            <p className="text-[11px] font-medium text-slate-600">
                              第 {c.row} 行 {c.model}
                            </p>
                            <div className="mt-1.5 grid grid-cols-2 gap-2">
                              {c.heights.map((height, index) => (
                                <label
                                  key={`${c.row}-${index}`}
                                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1"
                                >
                                  <span className="text-[11px] text-slate-500">
                                    {c.labels[index] ?? `第 ${index + 1} 组`}（高 {height}）
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={splitQty[c.row]?.[index] ?? ""}
                                    onChange={(e) => {
                                      const next = [
                                        ...(splitQty[c.row] ?? c.heights.map(() => "")),
                                      ];
                                      next[index] = e.target.value;
                                      setSplitQty((prev) => ({ ...prev, [c.row]: next }));
                                    }}
                                    placeholder="数量"
                                    className="w-16 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {!splitReady && (
                        <p className="mt-2 text-xs text-red-600">请为每个变体填写 0 或更大的整数数量</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importReport.valid === 0 && (
                <p className="text-xs text-red-600">没有可导入的数据，请检查表格内容。</p>
              )}
                </>
              )}

              {importStep === 2 && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <p className="text-[11px] text-slate-500">明细行数</p>
                      <p className="mt-0.5 text-lg font-semibold leading-tight text-slate-800">
                        {planned.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                      <p className="text-[11px] text-emerald-600">新增</p>
                      <p className="mt-0.5 text-lg font-semibold leading-tight text-emerald-700">
                        {planTotals.create}
                      </p>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                      <p className="text-[11px] text-blue-500">更新</p>
                      <p className="mt-0.5 text-lg font-semibold leading-tight text-blue-700">
                        {planTotals.update}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <p className="text-[11px] text-slate-500">跳过</p>
                      <p className="mt-0.5 text-lg font-semibold leading-tight text-slate-600">
                        {planTotals.skip}
                      </p>
                    </div>
                  </div>
                  {importReport.newCategories.length > 0 && (
                    <p className="text-xs text-slate-500">
                      将自动创建类目：{importReport.newCategories.join("、")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    请核对以下物品与数量，确认无误后点击「确认导入」。
                  </p>

              {planned.length > 0 && (
                <div className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-700">物品明细</p>
                    <p className="text-xs text-slate-400">按行号排列</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {planned.map((item) => (
                      <div
                        key={item.row}
                        className="flex items-start gap-3 px-3 py-2.5 text-xs transition hover:bg-slate-50"
                      >
                        <div className="flex w-24 shrink-0 flex-col">
                          <p className="flex h-5 items-center text-[11px] tabular-nums text-slate-400">
                            第 {item.row} 行
                          </p>
                          <span className="mt-1 flex h-5 w-fit items-center rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">
                            {item.category}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-slate-800">{item.name}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                              {item.model}
                            </span>
                            <span className="text-[11px] text-slate-400">¥{item.price}</span>
                          </div>
                          {item.action === "skip" ? (
                            <p className="mt-1 text-[11px] text-slate-400">{item.skipReason}</p>
                          ) : (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600">
                              {item.variants.map((v, index) => (
                                <span key={index} className="rounded-md bg-slate-50 px-1.5 py-0.5">
                                  {v.title}
                                </span>
                              ))}
                              {item.action === "update" && (
                                <span className="text-[11px] text-blue-600">库存数量将被覆盖</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              item.action === "create"
                                ? "bg-emerald-50 text-emerald-700"
                                : item.action === "update"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.action === "create"
                              ? "新增"
                              : item.action === "update"
                                ? "更新"
                                : "跳过"}
                          </span>
                          {item.action !== "skip" && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                                item.variants.some((v) => v.quantity === null)
                                  ? "bg-red-50 text-red-600"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {item.variants.some((v) => v.quantity === null)
                                ? "待填写"
                                : item.variants.map((v) => v.quantity).join(" / ")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </>
              )}

              {importStep === 1 && (
                <button
                  onClick={() => importRef.current?.click()}
                  disabled={importParsing || importing}
                  className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
                >
                  重新选择表格
                </button>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function ImportOption<T extends string>({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: T;
  checked: boolean;
  onChange: (value: T) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
        checked
          ? "border-blue-400 bg-blue-50/70 text-blue-800"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 accent-blue-600"
      />
      <span>{children}</span>
    </label>
  );
}
