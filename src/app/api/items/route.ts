import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { parsePagination, paginated } from "@/lib/pagination";
import { itemToPlain } from "@/lib/serialize";

const itemInclude = { category: { select: { id: true, name: true } } };
const MAX_QUANTITY = 1_000_000_000;
const MAX_PRICE = 9_999_999_999.99;

/** GET 后台物品列表（管理员）：支持 keyword 搜索 + 分页 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  const sp = req.nextUrl.searchParams;
  const { page, pageSize, skip } = parsePagination(sp);
  const keyword = sp.get("keyword");

  const where: Prisma.ItemWhereInput = {};
  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: "insensitive" } },
      { model: { contains: keyword, mode: "insensitive" } },
    ];
  }
  const categoryId = sp.get("categoryId");
  if (categoryId) {
    where.categoryId = categoryId;
  }

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: itemInclude,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  return NextResponse.json(
    paginated((items as unknown[]).map((i) => itemToPlain(i as never)), total, page, pageSize),
  );
}

/** POST 上架物品（管理员） */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const model = String(body.model || "").trim();
  const categoryId = String(body.categoryId || "");
  if (!name || !model || !categoryId) {
    return NextResponse.json({ error: "名称、型号、分类为必填项" }, { status: 400 });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return NextResponse.json({ error: "分类不存在" }, { status: 400 });
  }

  // 与编辑接口保持一致：非法数字直接拒绝，避免被静默转换为 0
  const nums = [body.price, body.innerDiameter, body.outerDiameter, body.height].map(
    (v) => (v === undefined || v === null || v === "" ? 0 : Number(v)),
  );
  if (nums.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: "单价和尺寸必须是数字" }, { status: 400 });
  }
  const [price, innerDiameter, outerDiameter, height] = nums;
  if (price < 0 || innerDiameter < 0 || outerDiameter < 0 || height < 0) {
    return NextResponse.json({ error: "单价和尺寸不能为负数" }, { status: 400 });
  }
  if (price > MAX_PRICE) {
    return NextResponse.json({ error: "单价超出允许范围" }, { status: 400 });
  }

  // 数量必须是非负整数且不超过上限，避免小数被静默截断或超出 Int32 触发 500
  const rawQuantity =
    body.quantity === undefined || body.quantity === null || body.quantity === ""
      ? 0
      : Number(body.quantity);
  if (!Number.isInteger(rawQuantity) || rawQuantity < 0 || rawQuantity > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `初始数量必须是 0 到 ${MAX_QUANTITY} 的整数` },
      { status: 400 },
    );
  }
  const quantity = rawQuantity;

  const item = await prisma.item.create({
    data: {
      name,
      model,
      categoryId,
      image: body.image ? String(body.image) : null,
      price,
      remark: body.remark ? String(body.remark) : null,
      supplier: body.supplier ? String(body.supplier) : null,
      innerDiameter,
      outerDiameter,
      height,
      quantity,
    },
    include: itemInclude,
  });

  return NextResponse.json(itemToPlain(item as never));
}
