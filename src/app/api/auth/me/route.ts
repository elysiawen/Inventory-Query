import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/** 当前登录账号的最新信息（用户名/角色可能已被管理员修改） */
export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;
  const user = guard.user!;
  return NextResponse.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    avatar: user.avatar,
  });
}
