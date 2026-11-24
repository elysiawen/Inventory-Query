import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** 出库：数量 -Y，校验不超库存，写一条 OUT 流水（事务） */
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

  const MAX_QUANTITY = 1_000_000_000;
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `出库数量必须是 1 到 ${MAX_QUANTITY} 的整数` },
      { status: 400 },
    );
  }

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "物品不存在" }, { status: 404 });
  }
  if (quantity > item.quantity) {
    return NextResponse.json(
      { error: `出库数量 ${quantity} 超过当前库存 ${item.quantity}` },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 条件更新：库存不足时影响 0 行，避免并发下出现负库存
      const updated = await tx.item.updateMany({
        where: { id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (updated.count === 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }
      await tx.stockLog.create({
        data: {
          itemId: id,
          type: "OUT",
          quantity,
          operatorId: guard.user!.id,
          remark: body.remark ? String(body.remark) : null,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "库存不足，出库失败" }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ success: true });
}
