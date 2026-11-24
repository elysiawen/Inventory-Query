import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { parsePagination, paginated } from "@/lib/pagination";
import { itemToPlain } from "@/lib/serialize";

/** 前台查询：登录即可（含管理员）。keyword 模糊 + 分类 + 尺寸范围 + 分页 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.response) return guard.response;

  const sp = req.nextUrl.searchParams;
  const { page, pageSize, skip } = parsePagination(sp);

  const keyword = sp.get("keyword");
  const categoryId = sp.get("categoryId");
  const innerMin = sp.get("innerMin");
  const innerMax = sp.get("innerMax");
  const outerMin = sp.get("outerMin");
  const outerMax = sp.get("outerMax");
  const heightMin = sp.get("heightMin");
  const heightMax = sp.get("heightMax");
  const innerExact = sp.get("innerExact");
  const outerExact = sp.get("outerExact");
  const heightExact = sp.get("heightExact");

  // 排序：字段白名单 + 升降序，默认按更新时间倒序；id 作为稳定二级排序，避免分页抖动
  const sortBy = sp.get("sortBy") || "updatedAt";
  const sortOrder = sp.get("sortOrder") === "asc" ? "asc" : "desc";
  const SORT_FIELDS: Record<string, Prisma.ItemOrderByWithRelationInput> = {
    updatedAt: { updatedAt: sortOrder },
    name: { name: sortOrder },
    price: { price: sortOrder },
    quantity: { quantity: sortOrder },
    innerDiameter: { innerDiameter: sortOrder },
    outerDiameter: { outerDiameter: sortOrder },
    height: { height: sortOrder },
  };
  // 仅接受白名单内的字段，避免 constructor 等原型链属性被当作排序字段导致 500
  const picked = Object.hasOwn(SORT_FIELDS, sortBy) ? SORT_FIELDS[sortBy] : null;
  const orderBy: Prisma.ItemOrderByWithRelationInput[] = [
    picked ?? { updatedAt: "desc" },
    { id: "asc" },
  ];

  const where: Prisma.ItemWhereInput = {};

  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: "insensitive" } },
      { model: { contains: keyword, mode: "insensitive" } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;

  const dimFilter = (
    exact: string | null,
    min: string | null,
    max: string | null,
  ): Prisma.IntFilter | Prisma.FloatFilter | undefined => {
    const cond: Record<string, number> = {};
    if (exact !== null && exact !== "") {
      const n = Number(exact);
      if (Number.isFinite(n)) cond.equals = n;
    } else {
      if (min !== null && min !== "") {
        const n = Number(min);
        if (Number.isFinite(n)) cond.gte = n;
      }
      if (max !== null && max !== "") {
        const n = Number(max);
        if (Number.isFinite(n)) cond.lte = n;
      }
    }
    return Object.keys(cond).length ? (cond as never) : undefined;
  };

  const inner = dimFilter(innerExact, innerMin, innerMax);
  const outer = dimFilter(outerExact, outerMin, outerMax);
  const height = dimFilter(heightExact, heightMin, heightMax);
  if (inner) where.innerDiameter = inner as Prisma.FloatFilter;
  if (outer) where.outerDiameter = outer as Prisma.FloatFilter;
  if (height) where.height = height as Prisma.FloatFilter;

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  return NextResponse.json(
    paginated((items as unknown[]).map((i) => itemToPlain(i as never)), total, page, pageSize),
  );
}
