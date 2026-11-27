import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { signToken } from "@/lib/jwt";

/** POST 用当前有效 token 换取新 token（活跃即续期，有效期重新计算） */
export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  const sessionId = guard.user!.sessionId;
  // 记录活跃时间，供登录时清理长期不用的会话；
  // 用 updateMany 避免会话刚好被退出登录删除时抛 P2025 导致 500
  await prisma.session.updateMany({
    where: { id: sessionId },
    data: { lastSeenAt: new Date() },
  });

  const token = signToken({
    id: guard.user!.id,
    username: guard.user!.username,
    role: guard.user!.role,
    sid: sessionId,
  });
  return NextResponse.json({ token });
}
