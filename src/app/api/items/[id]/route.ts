import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { itemToPlain } from "@/lib/serialize";
import { removeUploadedFile } from "@/lib/uploads";

const itemInclude = { category: { select: { id: true, name: true } } };

/** PUT 编辑物品（管理员） */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const v = String(body.name).trim();
    if (!v) {
      return NextResponse.json({ error: "物品名称不能为空" }, { status: 400 });
    }
    data.name = v;
  }
  if (body.model !== undefined) {
    const v = String(body.model).trim();
    if (!v) {
      return NextResponse.json({ error: "型号不能为空" }, { status: 400 });
    }
    data.model = v;
  }
  if (body.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: String(body.categoryId) },
    });
    if (!category) {
      return NextResponse.json({ error: "分类不存在" }, { status: 400 });
    }
    data.categoryId = String(body.categoryId);
  }
  if (body.image !== undefined) data.image = body.image ? String(body.image) : null;

  const nonNegative = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const numericFields: [string, unknown][] = [
    ["price", body.price],
    ["innerDiameter", body.innerDiameter],
    ["outerDiameter", body.outerDiameter],
    ["height", body.height],
  ];
  for (const [field, value] of numericFields) {
    if (value === undefined) continue;
    const n = nonNegative(value);
    if (n === null) {
      return NextResponse.json({ error: "数值字段不能为负数" }, { status: 400 });
    }
    if (field === "price" && n > 9_999_999_999.99) {
      return NextResponse.json({ error: "单价超出允许范围" }, { status: 400 });
    }
    data[field] = n;
  }

  if (body.remark !== undefined) data.remark = body.remark ? String(body.remark) : null;
  if (body.supplier !== undefined) data.supplier = body.supplier ? String(body.supplier) : null;

  // 记录旧图片，更新成功后清理被替换掉的文件
  const itemBefore = await prisma.item.findUnique({
    where: { id },
    select: { image: true },
  });

  try {
    const item = await prisma.item.update({
      where: { id },
      data,
      include: itemInclude,
    });
    // 替换图片后清理旧文件，避免上传目录里堆积无引用的图片
    if (data.image !== undefined && item.image !== itemBefore?.image && itemBefore?.image) {
      await removeUploadedFile(itemBefore.image);
    }
    return NextResponse.json(itemToPlain(item as never));
  } catch {
    return NextResponse.json({ error: "更新失败，物品可能不存在" }, { status: 400 });
  }
}

/** DELETE 删除物品（管理员）；存在出入库流水时禁止删除，保留审计记录 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  // 先给出友好提示；真正的删除再用「无流水」条件原子执行，避免检查与删除之间新插入流水被级联删除
  const logCount = await prisma.stockLog.count({ where: { itemId: id } });
  if (logCount > 0) {
    return NextResponse.json(
      { error: `该物品存在 ${logCount} 条出入库流水，无法删除` },
      { status: 409 },
    );
  }

  try {
    const deleted = await prisma.item.delete({
      where: { id, stockLogs: { none: {} } },
    });
    await removeUploadedFile(deleted.image);
    return NextResponse.json({ success: true });
  } catch (e) {
    // P2025：记录不存在，或不满足「无流水」条件（并发新增了流水）
    if ((e as { code?: string })?.code === "P2025") {
      const exists = await prisma.item.findUnique({ where: { id }, select: { id: true } });
      return NextResponse.json(
        { error: exists ? "该物品存在出入库流水，无法删除" : "删除失败，物品可能不存在" },
        { status: exists ? 409 : 400 },
      );
    }
    return NextResponse.json({ error: "删除失败，物品可能不存在" }, { status: 400 });
  }
}
