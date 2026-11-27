import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { removeUploadedFile } from "@/lib/uploads";

const userSelect = {
  id: true,
  username: true,
  nickname: true,
  role: true,
  active: true,
  avatar: true,
  createdAt: true,
};

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let body: {
    username?: string;
    password?: string;
    role?: string;
    active?: boolean;
    nickname?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "更新失败，用户可能不存在" }, { status: 400 });
  }

  // 不允许修改自己的角色或启用状态，避免把自己锁在系统外
  if (
    guard.user!.id === id &&
    (body.role !== undefined || typeof body.active === "boolean")
  ) {
    return NextResponse.json(
      { error: "不能修改自己的角色或启用状态，请由其他管理员操作" },
      { status: 400 },
    );
  }

  // 至少保留一个启用中的管理员
  const losesAdmin =
    target.role === "ADMIN" && (body.role === "USER" || body.active === false);
  if (losesAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "系统至少需要保留一个启用中的管理员" },
        { status: 400 },
      );
    }
  }

  const data: {
    username?: string;
    nickname?: string | null;
    passwordHash?: string;
    role?: "ADMIN" | "USER";
    active?: boolean;
  } = {};
  let passwordChanged = false;
  if (body.nickname !== undefined) {
    // 空字符串表示清除昵称，页面回退显示账号
    const nickname = String(body.nickname).trim() || null;
    if (nickname && nickname.length > 30) {
      return NextResponse.json({ error: "昵称最多 30 个字符" }, { status: 400 });
    }
    data.nickname = nickname;
  }
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
    data.passwordHash = await hashPassword(password);
    // 管理员重置密码后，该账号的全部会话作废，各端都需重新登录
    passwordChanged = true;
  }
  if (body.role !== undefined) {
    // 角色只接受枚举值，避免小写等非法值被静默归一化后绕过「最后管理员」判断
    if (body.role !== "ADMIN" && body.role !== "USER") {
      return NextResponse.json({ error: "角色只能是 ADMIN 或 USER" }, { status: 400 });
    }
    data.role = body.role;
  }
  if (typeof body.active === "boolean") data.active = body.active;

  try {
    // 改密码与会话作废放在同一事务，避免密码已改但旧会话仍可使用
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: userSelect,
      });
      if (passwordChanged || body.active === false) {
        // 改密或禁用账号时作废该用户全部会话，避免重新启用后旧 token 复活
        await tx.session.deleteMany({ where: { userId: id } });
      }
      return updated;
    });
    return NextResponse.json(user);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ error: "账号已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: "更新失败，用户可能不存在" }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  if (guard.user!.id === id) {
    return NextResponse.json({ error: "不能删除当前登录的自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const logCount = await prisma.stockLog.count({ where: { operatorId: id } });
  if (logCount > 0) {
    return NextResponse.json(
      { error: `该账号存在 ${logCount} 条出入库流水，无法删除，请改为禁用` },
      { status: 409 },
    );
  }

  // 删除的是启用中的管理员时，必须还有其他启用中的管理员，避免系统无人可管理
  if (target.role === "ADMIN" && target.active) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "系统至少需要保留一个启用中的管理员" },
        { status: 400 },
      );
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "删除失败，该账号存在关联数据" }, { status: 409 });
  }
  await removeUploadedFile(target.avatar);
  return NextResponse.json({ success: true });
}
