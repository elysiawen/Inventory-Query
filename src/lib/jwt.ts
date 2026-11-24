import jwt from "jsonwebtoken";

const DEV_SECRET = "dev-secret-change-me";
// 生产环境必须显式配置 JWT_SECRET，缺失时直接启动失败，避免使用公开默认密钥被伪造 token
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET)
) {
  throw new Error("生产环境必须配置 JWT_SECRET 环境变量");
}
const SECRET = process.env.JWT_SECRET || DEV_SECRET;
const EXPIRES_IN = "7d";

export type UserRole = "ADMIN" | "USER";

export interface JwtPayload {
  id: string;
  username: string;
  role: UserRole;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
