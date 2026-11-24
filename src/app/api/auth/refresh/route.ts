import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { signToken } from "@/lib/jwt";

/** POST 用当前有效 token 换取新 token（活跃即续期，有效期重新计算） */
export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  const token = signToken({
    id: guard.user!.id,
    username: guard.user!.username,
    role: guard.user!.role,
  });
  return NextResponse.json({ token });
}
