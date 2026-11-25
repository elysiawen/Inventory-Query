const TOKEN_KEY = "inv_token";
const USER_KEY = "inv_user";

export interface AuthUser {
  id: string;
  username: string;
  nickname?: string | null;
  role: "ADMIN" | "USER";
  avatar?: string | null;
}

/** 展示名：优先昵称，未设置时回退账号 */
export function displayNameOf(user: { username: string; nickname?: string | null } | null): string {
  if (!user) return "";
  return user.nickname?.trim() || user.username;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** 用户信息变更事件：同一页面内的布局组件据此同步用户名/头像 */
export const USER_CHANGED_EVENT = "inv-user-changed";

export function setStoredUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(USER_CHANGED_EVENT));
}

export function logout() {
  setToken(null);
  setStoredUser(null);
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  // 仅登录接口的 401 表示账号或密码错误；其他 401（含 /api/auth/me）表示会话失效
  const isLoginEndpoint = path === "/api/auth/login";
  if (res.status === 401 && !isLoginEndpoint) {
    logout();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("未登录或登录已过期");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `请求失败 (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get: (path: string) => request(path, { method: "GET" }),
  post: (path: string, body?: unknown) =>
    request(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: (path: string, body?: unknown) =>
    request(path, {
      method: "PUT",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: (path: string) => request(path, { method: "DELETE" }),
  upload: async (path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request(path, { method: "POST", body: form });
  },
  uploadForm: async (path: string, form: FormData) =>
    request(path, { method: "POST", body: form }),
};

/** 用当前 token 换取新 token，实现活跃续期；失败时静默，不打断当前操作 */
export async function refreshSessionToken(): Promise<boolean> {
  if (typeof window === "undefined" || !getToken()) return false;
  try {
    const res = (await api.post("/api/auth/refresh")) as { token?: string };
    if (res?.token) {
      setToken(res.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 拉取当前账号最新信息并更新本地缓存（用户名/角色可能已被管理员修改），同时续期登录状态 */
export async function refreshStoredUser(): Promise<AuthUser | null> {
  if (typeof window === "undefined" || !getToken()) return null;
  try {
    const user = (await api.get("/api/auth/me")) as AuthUser;
    setStoredUser(user);
    await refreshSessionToken();
    return user;
  } catch {
    return null;
  }
}
