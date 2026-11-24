import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

const userSelect = {
  id: true,
  username: true,
  role: true,
  active: true,
  avatar: true,
  createdAt: true,
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let body: { username?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const role = body.role;
  if (!username || !password) {
    return NextResponse.json({ error: "账号和密码必填" }, { status: 400 });
  }
  if (!/^\S{1,50}$/.test(username)) {
    return NextResponse.json({ error: "账号需为 1-50 个非空白字符" }, { status: 400 });
  }
  if (password.length < 6 || password.length > 72) {
    return NextResponse.json({ error: "密码长度需为 6-72 位" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: "账号已存在" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "USER",
      },
      select: userSelect,
    });
    return NextResponse.json(user);
  } catch (e) {
    // 并发创建同名账号时唯一索引冲突，返回 409 而不是 500
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "账号已存在" }, { status: 409 });
    }
    throw e;
  }
}
