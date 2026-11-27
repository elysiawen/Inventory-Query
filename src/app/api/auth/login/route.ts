import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signToken } from "@/lib/jwt";

// 简单的内存登录限流：同一 IP + 账号 15 分钟内失败 5 次后锁定
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

interface Attempt {
  failures: number;
  firstAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, Attempt>();

function clientKey(req: NextRequest, username: string) {
  // 默认不信任客户端可伪造的 X-Forwarded-For，避免换 IP 绕过限流；
  // 仅当部署在会覆盖该请求头的反向代理之后时，才设置 TRUST_PROXY=1 按 IP 细分
  if (process.env.TRUST_PROXY !== "1") return `local:${username}`;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${ip}:${username}`;
}

const SWEEP_THRESHOLD = 5000;
const MAX_ENTRIES = 20000;

/** 清理已过期的失败记录，并在条目过多时淘汰最旧记录，避免内存无上限增长 */
function sweep() {
  const now = Date.now();
  for (const [key, record] of attempts) {
    const expiredLock = record.lockedUntil > 0 && record.lockedUntil <= now;
    const expiredWindow = record.lockedUntil === 0 && now - record.firstAt > WINDOW_MS;
    if (expiredLock || expiredWindow) attempts.delete(key);
  }
  if (attempts.size > MAX_ENTRIES) {
    const oldest = [...attempts.entries()]
      .sort((a, b) => a[1].firstAt - b[1].firstAt)
      .slice(0, attempts.size - MAX_ENTRIES);
    for (const [key] of oldest) attempts.delete(key);
  }
}

function lockSecondsRemaining(key: string) {
  const record = attempts.get(key);
  if (!record) return 0;
  if (record.lockedUntil > Date.now()) {
    return Math.ceil((record.lockedUntil - Date.now()) / 1000);
  }
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    attempts.delete(key);
  }
  return 0;
}

function recordFailure(key: string) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.firstAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  record.failures += 1;
  if (record.failures >= MAX_FAILURES) {
    record.lockedUntil = now + WINDOW_MS;
  }
}

export async function POST(req: NextRequest) {
  if (attempts.size > SWEEP_THRESHOLD) sweep();

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ error: "账号和密码不能为空" }, { status: 400 });
  }

  const key = clientKey(req, username);
  const locked = lockSecondsRemaining(key);
  if (locked > 0) {
    return NextResponse.json(
      { error: `尝试次数过多，请 ${Math.ceil(locked / 60)} 分钟后再试` },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    recordFailure(key);
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }
  if (!user.active) {
    return NextResponse.json({ error: "账号已被禁用" }, { status: 403 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    recordFailure(key);
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }

  attempts.delete(key);

  // 顺手清理该账号长期未活跃的会话，避免会话表无限增长（60 天）
  await prisma.session.deleteMany({
    where: {
      userId: user.id,
      lastSeenAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
    },
  });

  // 每次登录生成独立会话，各设备互不影响
  const session = await prisma.session.create({
    data: { userId: user.id },
    select: { id: true },
  });

  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role,
    sid: session.id,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      avatar: user.avatar,
    },
  });
}
