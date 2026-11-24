import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

const userSelect = { id: true, username: true, role: true, avatar: true };

/** PUT 修改自己的用户名 / 密码（登录用户） */
export async function PUT(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  let body: { username?: unknown; password?: unknown; oldPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const data: { username?: string; passwordHash?: string } = {};

  if (body.username !== undefined) {
    const username = String(body.username).trim();
    if (!/^\S{1,50}$/.test(username)) {
      return NextResponse.json({ error: "账号需为 1-50 个非空白字符" }, { status: 400 });
    }
    data.username = username;
  }

  if (body.password !== undefined && body.password !== "") {
    const password = String(body.password);
    if (password.length < 6 || password.length > 72) {
      return NextResponse.json({ error: "密码长度需为 6-72 位" }, { status: 400 });
    }
    // 修改密码必须先校验原密码，避免 token 泄露后被直接改密
    const oldPassword = String(body.oldPassword ?? "");
    if (!oldPassword) {
      return NextResponse.json({ error: "请输入原密码" }, { status: 400 });
    }
    const current = await prisma.user.findUnique({
      where: { id: guard.user!.id },
      select: { passwordHash: true },
    });
    if (!current || !(await verifyPassword(oldPassword, current.passwordHash))) {
      return NextResponse.json({ error: "原密码不正确" }, { status: 400 });
    }
    data.passwordHash = await hashPassword(password);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有需要修改的内容" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: guard.user!.id },
      data,
      select: userSelect,
    });
    return NextResponse.json(user);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ error: "账号已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: "修改失败，请稍后重试" }, { status: 400 });
  }
}
