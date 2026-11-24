"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">物品管理</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 上架物品
        </button>
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
              <span className="ml-1 text-xs font-normal text-slate-400">内径 × 外径 × 高度</span>
            </span>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500">
              <input
                className="min-w-0 flex-1 px-3 py-2 text-center text-sm focus:outline-none"
                type="number"
                step="0.01"
                placeholder="内径"
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
                placeholder="高度"
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
    </div>
  );
}
