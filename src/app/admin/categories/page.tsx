"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal, Field, inputCls, Loading, ErrorState } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";

interface Category {
  id: string;
  name: string;
  createdAt: string;
  _count?: { items: number };
}

export default function CategoriesPage() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = (await api.get("/api/categories")) as Category[];
      setList(data);
    } catch (e) {
      setLoadError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setModalOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setModalOpen(true);
  }
  async function handleSave() {
    if (!name.trim()) {
      toast.error("分类名称不能为空");
      return;
    }
    setSaving(true);
    try {
      if (editing) await api.put(`/api/categories/${editing.id}`, { name });
      else await api.post("/api/categories", { name });
      setModalOpen(false);
      toast.success(editing ? "保存成功" : "新增成功");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete(c: Category) {
    const ok = await confirm(`确定删除分类「${c.name}」吗？`, {
      title: "删除分类",
      confirmText: "删除",
      confirmColor: "red",
    });
    if (!ok) return;
    try {
      await api.delete(`/api/categories/${c.id}`);
      toast.success("删除成功");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">分类管理</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新增分类
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {list.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
                暂无分类，请点击右上角新增
              </div>
            ) : (
              list.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-slate-800">{c.name}</div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {c._count?.items ?? 0} 个物品
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-lg border border-slate-300 py-1.5 text-xs text-blue-600 transition hover:bg-slate-50"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
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
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">分类名称</th>
                <th className="px-4 py-3">关联物品数</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    暂无分类，请点击右上角新增
                  </td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-700">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c._count?.items ?? 0}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(c)}
                        className="mr-3 text-blue-600 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
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
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "编辑分类" : "新增分类"}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
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
        <Field label="分类名称" required>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}
