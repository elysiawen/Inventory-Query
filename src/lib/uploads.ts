import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";

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

/** 各用途图片压缩后的最长边限制，避免原图直接落盘占用过多空间与带宽 */
const MAX_EDGE: Record<UploadKind, number> = { items: 800, avatars: 256 };

/**
 * 服务端压缩图片：按 EXIF 纠正方向、限制最长边并按格式重新编码。
 * 图片无法解码时直接拒绝；仅编码阶段失败或压缩结果更大时保留原图。
 * GIF 可能是动图（sharp 会丢掉其余帧），只校验可解码、不做重编码。
 */
async function compressImage(
  buffer: Buffer,
  ext: string,
  kind: UploadKind,
): Promise<{ ok: true; buffer: Buffer } | { ok: false }> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // 文件头合法但内容损坏（或不是真正的图片），拒绝落盘，避免保存无法展示的垃圾文件
    return { ok: false };
  }
  // GIF 与动画 WebP 存在多帧，re-encode 只保留首帧，直接原样保存
  if (ext === ".gif" || (meta.pages ?? 1) > 1) return { ok: true, buffer };

  try {
    let pipeline = sharp(buffer).rotate().toColourspace("srgb");
    const maxEdge = MAX_EDGE[kind];
    if (meta.width && meta.height && Math.max(meta.width, meta.height) > maxEdge) {
      pipeline = pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    if (ext === ".png") {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 70 });
    } else if (ext === ".webp") {
      pipeline = pipeline.webp({ quality: 75 });
    } else {
      pipeline = pipeline.jpeg({ quality: 75, mozjpeg: true });
    }
    const compressed = await pipeline.toBuffer();
    return { ok: true, buffer: compressed.length < buffer.length ? compressed : buffer };
  } catch {
    return { ok: true, buffer };
  }
}

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
  const original = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(original, ext)) {
    return { ok: false, error: "文件内容与扩展名不匹配", status: 400 };
  }

  const compressed = await compressImage(original, ext, kind);
  if (!compressed.ok) {
    return { ok: false, error: "图片无法解析，请更换文件", status: 400 };
  }

  const buffer = compressed.buffer;
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
