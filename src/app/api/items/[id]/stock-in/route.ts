import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_QUANTITY = 1_000_000_000;
const MAX_TOTAL = 2_000_000_000;

/** 入库：数量 +X，写一条 IN 流水（事务） */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let body: { quantity?: unknown; remark?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `入库数量必须是 1 到 ${MAX_QUANTITY} 的整数` },
      { status: 400 },
    );
  }

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "物品不存在" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 条件更新：入库后超过上限时影响 0 行，避免数量溢出
      const updated = await tx.item.updateMany({
        where: { id, quantity: { lte: MAX_TOTAL - quantity } },
        data: { quantity: { increment: quantity } },
      });
      if (updated.count === 0) {
        throw new Error("STOCK_OVERFLOW");
      }
      await tx.stockLog.create({
        data: {
          itemId: id,
          type: "IN",
          quantity,
          operatorId: guard.user!.id,
          remark: body.remark ? String(body.remark) : null,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STOCK_OVERFLOW") {
      return NextResponse.json({ error: "入库后库存超出上限" }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ success: true });
}
