"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, getToken, setToken, setStoredUser } from "@/lib/api";
import { Loading, Spinner } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [checked, setChecked] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 已登录则直接进入对应首页，避免重复登录
  useEffect(() => {
    const user = getStoredUser();
    if (getToken() && user) {
      router.replace(user.role === "ADMIN" ? "/admin/items" : "/");
      return;
    }
    setChecked(true);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = (await api.post("/api/auth/login", { username, password })) as {
        token: string;
        user: { id: string; username: string; role: "ADMIN" | "USER" };
      };
      setToken(res.token);
      setStoredUser(res.user);
      router.replace(res.user.role === "ADMIN" ? "/admin/items" : "/");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!checked) {
    return <Loading fullScreen text="正在验证登录状态…" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-blue-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl animate-zoom-in"
      >
        <h1 className="mb-1 text-2xl font-bold text-slate-800">库存查询系统</h1>
        <p className="mb-6 text-sm text-slate-500">请登录以继续</p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">账号</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">密码</span>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading && <Spinner className="h-4 w-4" />}
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
