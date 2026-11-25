import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

const userSelect = { id: true, username: true, nickname: true, role: true, avatar: true };

/** PUT 修改自己的用户名 / 密码（登录用户） */
export async function PUT(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  let body: {
    username?: unknown;
    nickname?: unknown;
    password?: unknown;
    oldPassword?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  // 用户名只能由管理员在账号管理中修改，普通用户仅可改昵称与密码
  if (body.username !== undefined) {
    return NextResponse.json(
      { error: "用户名不能自行修改，请联系管理员" },
      { status: 400 },
    );
  }

  const data: { nickname?: string | null; passwordHash?: string } = {};

  if (body.nickname !== undefined) {
    // 空字符串表示清除昵称，页面回退显示账号
    const nickname = String(body.nickname).trim() || null;
    if (nickname && nickname.length > 30) {
      return NextResponse.json({ error: "昵称最多 30 个字符" }, { status: 400 });
    }
    data.nickname = nickname;
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
