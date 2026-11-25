import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  IMPORT_MAX_FILE_SIZE,
  ImportInputError,
  ImportParseError,
  applyItemImport,
  buildImportReport,
  normalizeImportOptions,
  parseItemWorkbook,
} from "@/lib/item-import";

/**
 * POST 批量导入物品（管理员）
 * multipart/form-data：
 * - file: .xlsx 文件
 * - dryRun=1 时只解析并返回预览报告，不写库
 * - options: JSON 字符串，重复项 / 复合规格 / 非法行的处理策略
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传要导入的表格文件" }, { status: 400 });
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: "只支持 .xlsx 格式的表格" }, { status: 400 });
  }
  if (file.size > IMPORT_MAX_FILE_SIZE) {
    return NextResponse.json({ error: "表格文件不能超过 5MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseItemWorkbook(buffer);
  } catch (e) {
    if (e instanceof ImportParseError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const report = await buildImportReport(parsed, prisma);

  if (form.get("dryRun") === "1") {
    return NextResponse.json({ report });
  }

  const options = normalizeImportOptions(form.get("options") as string | null);
  if (options.invalid === "abort" && report.invalid.length > 0) {
    return NextResponse.json(
      { error: `表格中有 ${report.invalid.length} 行不合法，已取消导入`, report },
      { status: 409 },
    );
  }

  let result;
  try {
    result = await applyItemImport(parsed, options, prisma);
  } catch (e) {
    if (e instanceof ImportInputError) {
      return NextResponse.json({ error: e.message, report }, { status: 400 });
    }
    throw e;
  }
  return NextResponse.json({ ...result, report });
}
