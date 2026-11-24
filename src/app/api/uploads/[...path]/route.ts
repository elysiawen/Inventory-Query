import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * 读取上传目录中的图片。
 * next start 不提供构建后新增的 public 文件，因此 /uploads/* 会被 next.config 重写到这里，
 * 由路由直接读磁盘返回，避免生产环境上传后图片 404。
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const uploadRoot = path.join(process.cwd(), "public", "uploads");

  // 允许根目录的旧文件，以及 items / avatars 两个子目录，禁止其它层级
  const shapeOk =
    segments.length === 1 ||
    (segments.length === 2 && (segments[0] === "items" || segments[0] === "avatars"));
  if (!shapeOk) {
    return NextResponse.json({ error: "无效的文件路径" }, { status: 400 });
  }

  const filename = segments[segments.length - 1];
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    return NextResponse.json({ error: "无效的文件路径" }, { status: 400 });
  }

  const filePath = path.resolve(uploadRoot, ...segments);
  if (!filePath.startsWith(uploadRoot + path.sep)) {
    return NextResponse.json({ error: "无效的文件路径" }, { status: 400 });
  }

  const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()];
  if (!contentType) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
