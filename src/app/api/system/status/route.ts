import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** 后台系统状态：数据库连通性 + 数据量统计 + 运行信息 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const startedAt = Date.now();
  let dbOk = true;
  let dbLatencyMs = 0;
  let counts: {
    users: number;
    categories: number;
    items: number;
    logs: number;
    stockQuantity: number;
  } | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - startedAt;

    const [users, categories, items, logs, stock] = await Promise.all([
      prisma.user.count(),
      prisma.category.count(),
      prisma.item.count(),
      prisma.stockLog.count(),
      prisma.item.aggregate({ _sum: { quantity: true } }),
    ]);
    counts = {
      users,
      categories,
      items,
      logs,
      stockQuantity: stock._sum.quantity ?? 0,
    };
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    counts,
    runtime: {
      node: process.version,
      env: process.env.NODE_ENV ?? "unknown",
      uptimeSec: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    },
    operator: guard.user!.username,
  });
}
