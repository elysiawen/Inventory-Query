import { NextRequest, NextResponse } from "next/server";
import { verifyToken, JwtPayload } from "./jwt";
import { prisma } from "./prisma";

/** 从请求头解析 token，仅验签，不查库 */
export function getTokenPayload(req: NextRequest): JwtPayload | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return verifyToken(token);
}

export interface AuthUserInfo extends JwtPayload {
  avatar: string | null;
}

interface GuardResult {
  user: AuthUserInfo | null;
  response: NextResponse | null;
}

/**
 * 要求登录：验签并回查数据库，确保账号仍存在且未被禁用，
 * 角色以数据库为准（禁用/降权立即生效，不必等 token 过期）。
 */
export async function requireAuth(req: NextRequest): Promise<GuardResult> {
  const payload = getTokenPayload(req);
  if (!payload) {
    return {
      user: null,
      response: NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, username: true, role: true, active: true, avatar: true },
  });
  if (!user || !user.active) {
    return {
      user: null,
      response: NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 }),
    };
  }

  return {
    user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar },
    response: null,
  };
}

/** 要求管理员：未登录 401，非管理员 403 */
export async function requireAdmin(req: NextRequest): Promise<GuardResult> {
  const result = await requireAuth(req);
  if (result.response) return result;
  if (result.user!.role !== "ADMIN") {
    return {
      user: null,
      response: NextResponse.json({ error: "无权限，需要管理员角色" }, { status: 403 }),
    };
  }
  return { user: result.user!, response: null };
}
