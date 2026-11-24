import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth";

/** GET：登录用户均可读取（前台筛选下拉需要） */
export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  const categories = await prisma.category.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(categories);
}

/** POST：仅管理员 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "分类名称必填" }, { status: 400 });
  }

  const exists = await prisma.category.findUnique({ where: { name: body.name.trim() } });
  if (exists) {
    return NextResponse.json({ error: "分类名称已存在" }, { status: 409 });
  }

  try {
    const category = await prisma.category.create({ data: { name: body.name.trim() } });
    return NextResponse.json(category);
  } catch (e) {
    // 并发创建同名分类时唯一索引冲突，返回 409 而不是 500
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "分类名称已存在" }, { status: 409 });
    }
    throw e;
  }
}
