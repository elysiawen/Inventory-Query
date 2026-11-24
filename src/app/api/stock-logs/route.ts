import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { parsePagination, paginated } from "@/lib/pagination";

/** 历史流水查询（管理员）：按物品、时间范围筛选 + 分页 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const sp = req.nextUrl.searchParams;
  const { page, pageSize, skip } = parsePagination(sp);
  const itemId = sp.get("itemId");
  const from = sp.get("from");
  const to = sp.get("to");

  // 仅日期（YYYY-MM-DD）时按东八区业务时间的当天起止处理，避免服务器时区为 UTC 时整体偏移 8 小时
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startOf = (s: string) =>
    isDateOnly(s) ? new Date(`${s}T00:00:00.000+08:00`) : new Date(s);
  const endOf = (s: string) =>
    isDateOnly(s) ? new Date(`${s}T23:59:59.999+08:00`) : new Date(s);

  const where: Prisma.StockLogWhereInput = {};
  if (itemId) where.itemId = itemId;
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) {
      const d = startOf(from);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (to) {
      const d = endOf(to);
      if (!Number.isNaN(d.getTime())) createdAt.lte = d;
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  }

  const [logs, total] = await Promise.all([
    prisma.stockLog.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, model: true } },
        operator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.stockLog.count({ where }),
  ]);

  return NextResponse.json(paginated(logs, total, page, pageSize));
}
