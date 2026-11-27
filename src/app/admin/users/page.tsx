"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, displayNameOf, getStoredUser, logout, refreshStoredUser } from "@/lib/api";
import { Modal, Field, inputCls, Loading, ErrorState } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";

interface UserRow {
  id: string;
  username: string;
  nickname?: string | null;
  role: "ADMIN" | "USER";
  active: boolean;
  avatar?: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [list, setList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ username: "", nickname: "", password: "", role: "USER" });
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const me = getStoredUser();
  const isSelf = !!editing && editing.id === me?.id;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = (await api.get("/api/users")) as UserRow[];
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
    setForm({ username: "", nickname: "", password: "", role: "USER" });
    setActive(true);
    setModalOpen(true);
  }
  function openEdit(u: UserRow) {
    setEditing(u);
    setForm({ username: u.username, nickname: u.nickname ?? "", password: "", role: u.role });
    setActive(u.active);
    setModalOpen(true);
  }
  async function handleSave() {
    const username = form.username.trim();
    if (!username) {
      toast.error("账号不能为空");
      return;
    }
    if (!/^\S{1,50}$/.test(username)) {
      toast.error("账号需为 1-50 个非空白字符");
      return;
    }
    if (form.password && (form.password.length < 6 || form.password.length > 72)) {
      toast.error("密码长度需为 6-72 位");
      return;
    }
    if (form.nickname.trim().length > 30) {
      toast.error("昵称最多 30 个字符");
      return;
    }
    if (!editing && !form.password) {
      toast.error("创建账号时密码必填");
      return;
    }
    setSaving(true);
    try {
      const changedOwnPassword = isSelf && !!form.password;
      if (editing) {
        const payload: Record<string, unknown> = { username, nickname: form.nickname.trim() };
        if (form.password) payload.password = form.password;
        // 服务端不允许修改自己的角色与启用状态，这里不提交对应字段
        if (!isSelf) {
          payload.role = form.role;
          payload.active = active;
        }
        await api.put(`/api/users/${editing.id}`, payload);
      } else {
        await api.post("/api/users", form);
      }
      setModalOpen(false);
      if (changedOwnPassword) {
        // 改自己的密码会让全部会话失效，直接回登录页，避免后续请求 401 被动跳转
        toast.success("密码已更新，请重新登录");
        logout();
        router.replace("/login");
        return;
      }
      toast.success(editing ? "保存成功" : "新增成功");
      // 改的是自己时同步本地缓存，避免顶部/侧边栏仍显示旧账号名
      if (isSelf) void refreshStoredUser();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const targetId = editing?.id;
    if (!file || !targetId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片不能超过 5MB");
      return;
    }
    setAvatarUploading(true);
    try {
      const updated = (await api.upload(
        `/api/users/${targetId}/avatar`,
        file,
      )) as UserRow;
      setList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      // 只更新仍是同一个账号的编辑表单，避免上传期间切到别的账号时把 A 的头像写到 B
      setEditing((prev) => (prev && prev.id === targetId ? updated : prev));
      // 改的是自己时同步本地缓存，避免顶部/侧边栏头像不同步
      if (isSelf) void refreshStoredUser();
      toast.success("头像已更新");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAvatarUploading(false);
    }
  }
  async function handleRemoveAvatar() {
    const targetId = editing?.id;
    if (!targetId) return;
    setAvatarRemoving(true);
    try {
      const updated = (await api.delete(`/api/users/${targetId}/avatar`)) as UserRow;
      setList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditing((prev) => (prev && prev.id === targetId ? updated : prev));
      if (isSelf) void refreshStoredUser();
      toast.success("头像已删除");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAvatarRemoving(false);
    }
  }
  async function handleDelete(u: UserRow) {
    const ok = await confirm(`确定删除账号「${u.username}」吗？`, {
      title: "删除账号",
      confirmText: "删除",
      confirmColor: "red",
    });
    if (!ok) return;
    try {
      await api.delete(`/api/users/${u.id}`);
      toast.success("删除成功");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">账号管理</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新增账号
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
                暂无账号，请点击右上角新增
              </div>
            ) : (
              list.map((u) => (
                <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">
                        {displayNameOf(u)}
                      </div>
                      {u.nickname ? (
                        <div className="truncate text-xs text-slate-400">@{u.username}</div>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        u.role === "ADMIN"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {u.role === "ADMIN" ? "管理员" : "普通用户"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {new Date(u.createdAt).toLocaleString()}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {u.active ? "启用中" : "已禁用"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="rounded-lg border border-slate-300 py-1.5 text-xs text-blue-600 transition hover:bg-slate-50"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
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
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">账号</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    暂无账号，请点击右上角新增
                  </td>
                </tr>
              ) : (
                list.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{displayNameOf(u)}</div>
                    {u.nickname ? (
                      <div className="text-xs text-slate-400">@{u.username}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.role === "ADMIN"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {u.role === "ADMIN" ? "管理员" : "普通用户"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {u.active ? "启用中" : "已禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(u)}
                      className="mr-3 text-blue-600 hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
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
        onClose={() => {
          // 头像上传中不允许关闭，避免回调落空
          if (!avatarUploading) setModalOpen(false);
        }}
        title={editing ? "编辑账号" : "新增账号"}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              disabled={avatarUploading}
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
        <div className="space-y-4">
          {editing ? (
            <Field label="头像">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
                  {editing.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editing.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    editing.username.charAt(0).toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  disabled={avatarUploading || avatarRemoving}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {avatarUploading ? "上传中…" : "更换头像"}
                </button>
                {editing.avatar && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveAvatar()}
                    disabled={avatarUploading || avatarRemoving}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {avatarRemoving ? "删除中…" : "删除头像"}
                  </button>
                )}
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => void handleAvatar(e)}
                />
              </div>
            </Field>
          ) : null}
          <Field label="账号" required>
            <input
              className={inputCls}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </Field>
          <Field label="昵称">
            <input
              className={inputCls}
              value={form.nickname}
              maxLength={30}
              placeholder="选填，留空则显示账号"
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </Field>
          <Field label={editing ? "新密码（留空不修改）" : "密码"} required={!editing}>
            <input
              type="password"
              className={inputCls}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="角色" required>
            <select
              className={inputCls}
              value={form.role}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="USER">普通用户</option>
              <option value="ADMIN">管理员</option>
            </select>
            {isSelf ? (
              <span className="mt-1 block text-xs text-slate-400">
                不能修改自己的角色，请由其他管理员操作
              </span>
            ) : null}
          </Field>
          {editing ? (
            <Field label="启用状态">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  disabled={isSelf}
                  onClick={() => setActive(!active)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    active ? "bg-blue-600" : "bg-slate-300"
                  } ${isSelf ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      active ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-600">
                  {active ? "启用中" : "已禁用"}
                </span>
                {isSelf ? (
                  <span className="text-xs text-slate-400">不能修改自己的启用状态</span>
                ) : null}
              </div>
            </Field>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
