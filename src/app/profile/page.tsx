"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  displayNameOf,
  getStoredUser,
  getToken,
  refreshStoredUser,
  setStoredUser,
  type AuthUser,
} from "@/lib/api";
import { inputCls, Loading } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
    setReady(true);
    refreshStoredUser().then((latest) => {
      if (latest) setUser(latest);
    });
  }, [router]);

  function applyUser(latest: AuthUser) {
    setStoredUser(latest);
    setUser(latest);
  }

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片不能超过 5MB");
      return;
    }
    setUploading(true);
    try {
      const latest = (await api.upload("/api/auth/avatar", file)) as AuthUser;
      applyUser(latest);
      toast.success("头像已更新");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    setRemovingAvatar(true);
    try {
      const latest = (await api.delete("/api/auth/avatar")) as AuthUser;
      applyUser(latest);
      toast.success("头像已删除");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRemovingAvatar(false);
    }
  }

  async function saveNickname() {
    const next = nickname.trim();
    if (next === (user?.nickname ?? "")) {
      toast.error("昵称没有变化");
      return;
    }
    setSavingNickname(true);
    try {
      // 空字符串表示清除昵称，页面回退显示账号
      const latest = (await api.put("/api/auth/profile", { nickname: next })) as AuthUser;
      applyUser(latest);
      setNickname("");
      toast.success(next ? "昵称已更新" : "昵称已清除");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingNickname(false);
    }
  }

  async function savePassword() {
    if (!oldPassword) {
      toast.error("请输入原密码");
      return;
    }
    if (password.length < 6 || password.length > 72) {
      toast.error("密码长度需为 6-72 位");
      return;
    }
    setSavingPassword(true);
    try {
      await api.put("/api/auth/profile", { password, oldPassword });
      setPassword("");
      setOldPassword("");
      toast.success("密码已更新");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPassword(false);
    }
  }

  if (!ready) return <Loading fullScreen text="正在加载个人资料…" />;

  const displayName = displayNameOf(user);
  const letter = displayName ? displayName.charAt(0).toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              返回
            </button>
            <h1 className="text-base font-semibold text-slate-800">个人资料</h1>
          </div>
          <Link href="/?mode=search" className="text-sm text-blue-600 hover:underline">
            首页
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="更换头像"
              className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-2xl font-semibold text-blue-700"
            >
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="头像" className="h-full w-full object-cover" />
              ) : (
                letter
              )}
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                  上传中
                </span>
              )}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-semibold text-slate-800">
                  {displayName || "-"}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                  {user?.role === "ADMIN" ? "管理员" : "普通用户"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                账号：{user?.username || "-"}（需修改请联系管理员）
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || removingAvatar}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {uploading ? "上传中…" : "更换头像"}
                </button>
                {user?.avatar && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveAvatar()}
                    disabled={uploading || removingAvatar}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {removingAvatar ? "删除中…" : "删除头像"}
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatar(e)}
              />
              <p className="mt-1 text-xs text-slate-400">
                支持 PNG / JPG / GIF / WEBP，最大 5MB
              </p>
            </div>
          </div>
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">修改昵称</h2>
          <p className="mt-1 text-xs text-slate-400">留空并保存可清除昵称，界面会回退显示账号</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              className={`${inputCls} sm:w-auto sm:flex-1`}
              value={nickname}
              maxLength={30}
              placeholder={`当前：${user?.nickname || "未设置"}`}
              onChange={(e) => setNickname(e.target.value)}
            />
            <button
              onClick={() => void saveNickname()}
              disabled={savingNickname}
              className="shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {savingNickname ? "保存中…" : "保存"}
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">修改密码</h2>
          <div className="mt-3 flex flex-col gap-3">
            <input
              className={inputCls}
              type="password"
              value={oldPassword}
              maxLength={72}
              placeholder="原密码"
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className={`${inputCls} sm:w-auto sm:flex-1`}
                type="password"
                value={password}
                maxLength={72}
                placeholder="新密码，6-72 位"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                onClick={() => void savePassword()}
                disabled={savingPassword}
                className="shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {savingPassword ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
