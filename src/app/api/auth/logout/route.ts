import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/** 退出登录：只作废当前这一端的会话，其他设备不受影响 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  await prisma.session.deleteMany({ where: { id: guard.user!.sessionId } });
  return NextResponse.json({ success: true });
}
