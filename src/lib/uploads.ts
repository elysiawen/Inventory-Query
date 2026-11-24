import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** 简单文件头校验，避免伪造扩展名上传可执行/脚本文件 */
function matchesSignature(buffer: Buffer, ext: string): boolean {
  if (ext === ".png") {
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === ".gif") {
    const head = buffer.subarray(0, 6).toString("ascii");
    return head === "GIF87a" || head === "GIF89a";
  }
  if (ext === ".webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

const UPLOAD_ROOT = () => path.join(process.cwd(), "public", "uploads");

export type UploadKind = "items" | "avatars";

/** 校验并保存图片，按用途分目录存放，返回可直接展示的 /uploads 路径 */
export async function saveImageFile(
  file: File,
  kind: UploadKind,
): Promise<{ ok: true; url: string } | { ok: false; error: string; status: number }> {
  if (file.size > MAX_IMAGE_SIZE) {
    return { ok: false, error: "图片不能超过 5MB", status: 413 };
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, error: "仅支持 PNG / JPG / GIF / WEBP 图片", status: 400 };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(buffer, ext)) {
    return { ok: false, error: "文件内容与扩展名不匹配", status: 400 };
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const dir = path.join(UPLOAD_ROOT(), kind);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return { ok: true, url: `/uploads/${kind}/${filename}` };
}

/** 删除上传目录中的旧图片（兼容根目录与 items/avatars 子目录），失败时静默跳过 */
export async function removeUploadedFile(url: string | null | undefined) {
  if (!url || !url.startsWith("/uploads/")) return;
  const segments = url.slice("/uploads/".length).split("/");
  if (segments.length > 2) return;

  const filename = segments[segments.length - 1];
  if (!filename || filename === "." || filename === "..") return;

  const root = UPLOAD_ROOT();
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(root + path.sep)) return;

  try {
    await unlink(target);
  } catch {
    // 文件不存在时忽略
  }
}
