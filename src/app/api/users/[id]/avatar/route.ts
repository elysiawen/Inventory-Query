import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { saveImageFile, removeUploadedFile } from "@/lib/uploads";

const userSelect = {
  id: true,
  username: true,
  nickname: true,
  role: true,
  active: true,
  avatar: true,
  createdAt: true,
};

/** POST 管理员为指定账号更换头像 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, avatar: true },
  });
  if (!target) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析上传数据" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "未找到文件字段 file" }, { status: 400 });
  }

  const saved = await saveImageFile(file, "avatars");
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: saved.status });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { avatar: saved.url },
      select: userSelect,
    });
    await removeUploadedFile(target.avatar);
    return NextResponse.json(user);
  } catch {
    await removeUploadedFile(saved.url);
    return NextResponse.json({ error: "头像更新失败，请稍后重试" }, { status: 400 });
  }
}

/** DELETE 管理员移除指定账号的头像 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, avatar: true },
  });
  if (!target) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { avatar: null },
    select: userSelect,
  });
  await removeUploadedFile(target.avatar);
  return NextResponse.json(user);
}
