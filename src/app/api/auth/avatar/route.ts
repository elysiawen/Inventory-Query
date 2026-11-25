import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { saveImageFile, removeUploadedFile } from "@/lib/uploads";

const userSelect = { id: true, username: true, nickname: true, role: true, avatar: true };

/** POST 上传并替换自己的头像（登录用户） */
export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

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
      where: { id: guard.user!.id },
      data: { avatar: saved.url },
      select: userSelect,
    });
    await removeUploadedFile(guard.user!.avatar);
    return NextResponse.json(user);
  } catch {
    await removeUploadedFile(saved.url);
    return NextResponse.json({ error: "头像更新失败，请稍后重试" }, { status: 400 });
  }
}

/** DELETE 删除自己的头像 */
export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  const user = await prisma.user.update({
    where: { id: guard.user!.id },
    data: { avatar: null },
    select: userSelect,
  });
  await removeUploadedFile(guard.user!.avatar);
  return NextResponse.json(user);
}
