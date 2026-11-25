"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { displayNameOf, getStoredUser, getToken, logout, refreshSessionToken, refreshStoredUser, USER_CHANGED_EVENT } from "@/lib/api";
import { Loading } from "./ui";

const NAV = [
  { href: "/admin/items", label: "物品管理" },
  { href: "/admin/categories", label: "分类管理" },
  { href: "/admin/users", label: "账号管理" },
  { href: "/admin/logs", label: "流水记录" },
  { href: "/admin/status", label: "系统状态" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(getStoredUser());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    const u = getStoredUser();
    if (!token || !u) {
      router.replace("/login");
      return;
    }
    if (u.role !== "ADMIN") {
      router.replace("/");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  // 同步管理员修改过的用户名/角色；角色被降级时立即退出后台
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    refreshStoredUser().then((u) => {
      if (cancelled || !u) return;
      setUser(u);
      if (u.role !== "ADMIN") router.replace("/");
    });
    return () => {
      cancelled = true;
    };
  }, [ready, router]);

  // 长时间挂着的后台页面也保持登录有效
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSessionToken();
    }, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // 资料页/账号管理里修改自己的用户名或头像后，侧边栏同步刷新
  useEffect(() => {
    function sync() {
      const latest = getStoredUser();
      if (latest) setUser(latest);
    }
    window.addEventListener(USER_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!ready) {
    return <Loading fullScreen text="正在验证登录状态…" />;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const roleLabel = user?.role === "ADMIN" ? "管理员" : "普通用户";
  const displayName = displayNameOf(user);
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-bold text-slate-800">库存管理后台</div>
            <div className="text-xs text-slate-400">Inventory Admin</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭菜单"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 transition hover:bg-slate-100"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                avatarLetter
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800" title={user?.username}>
                {displayName}
              </div>
              <span className="mt-0.5 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">
                {roleLabel}
              </span>
            </div>
          </Link>
          <Link
            href="/?mode=search"
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
            前台
          </Link>
          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-500 transition hover:bg-red-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="打开菜单"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div className="text-base font-semibold text-slate-800">库存管理后台</div>
        </header>
        <main key={pathname} className="flex-1 overflow-auto p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
