import jwt from "jsonwebtoken";

const DEV_SECRET = "dev-secret-change-me";
// .env.example 中的占位密钥同样禁止用于生产，避免直接复制示例配置后 token 可被伪造
const PLACEHOLDER_SECRETS = new Set([DEV_SECRET, "change-this-to-a-random-secret"]);
// 生产环境必须显式配置 JWT_SECRET，缺失时直接启动失败，避免使用公开默认密钥被伪造 token
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || PLACEHOLDER_SECRETS.has(process.env.JWT_SECRET))
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
  /** 会话 ID：对应数据库 Session 记录，删除该记录即让这一端登录失效 */
  sid?: string;
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
