import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
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

  try {
    const category = await prisma.category.update({
      where: { id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json(category);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ error: "分类名称已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: "更新失败，分类可能不存在" }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const count = await prisma.item.count({ where: { categoryId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `该分类下仍有 ${count} 个物品，无法删除` },
      { status: 409 },
    );
  }

  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2003" || err.code === "P2014") {
      return NextResponse.json({ error: "该分类下仍有物品，无法删除" }, { status: 409 });
    }
    return NextResponse.json({ error: "删除失败，分类可能不存在" }, { status: 400 });
  }
}
