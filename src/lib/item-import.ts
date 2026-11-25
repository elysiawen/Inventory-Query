import { readSheet } from "read-excel-file/node";
import type { PrismaClient } from "@prisma/client";

export const IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_QUANTITY = 1_000_000_000;
const MAX_IMPORT_ROWS = 5_000;
const MAX_PRICE = 9_999_999_999.99;
const HEADERS = ["类目", "存货全名", "规格", "型号", "最低售价", "库存数量", "备注"];

export type DuplicateStrategy = "skip" | "update" | "create";
export type CompoundStrategy = "first" | "split" | "skip";
export type InvalidStrategy = "abort" | "skip";

export interface ImportOptions {
  /** 已存在相同「类目+名称+型号」时：跳过 / 更新库存与价格 / 仍然新增 */
  duplicates: DuplicateStrategy;
  /** 规格含多组尺寸时：取第一组并备注原文 / 按每组尺寸拆分 / 跳过 */
  compound: CompoundStrategy;
  /** 存在不合法行时：全部回滚 / 跳过错误行 */
  invalid: InvalidStrategy;
}

export interface ImportPayload extends ImportOptions {
  /** 拆分复合规格时，按行号提供的各变体库存数量 */
  quantities?: Record<string, number[]>;
}

export interface ParsedRow {
  row: number;
  category: string;
  name: string;
  model: string;
  price: number;
  /** 表格中的第一个数量 */
  quantity: number;
  /** 表格填写的全部数量，支持 20/10 这种多数量写法 */
  quantities: number[];
  remark: string | null;
  innerDiameter: number;
  outerDiameter: number;
  height: number;
  compound: boolean;
  rawSpec: string;
}

export interface InvalidRow {
  row: number;
  reason: string;
}

export interface DuplicateRow {
  row: number;
  category: string;
  name: string;
  model: string;
  currentQuantity: number;
  currentPrice: number;
}

export interface CompoundRow {
  row: number;
  name: string;
  model: string;
  raw: string;
  parsed: { innerDiameter: number; outerDiameter: number; height: number };
  extraHeights: number[];
  /** 各变体的高度（第一个来自规格主段） */
  heights: number[];
  /** 各变体的数量，未按变体填写时长度为 1 */
  quantities: number[];
  /** 各变体的简称，来自规格括号内容，如 开 / ZZ */
  labels: string[];
}

/** 预览用的一行明细，供前端列出本次将写入的每条物品 */
export interface PreviewRow {
  row: number;
  category: string;
  name: string;
  model: string;
  price: number;
  /** 表格中填写的数量（复合规格可能是 20/10） */
  quantities: number[];
  /** 复合规格的全部高度，第一个来自规格主段 */
  heights: number[];
  /** 与 heights 对应的变体简称 */
  labels: string[];
  innerDiameter: number;
  outerDiameter: number;
  compound: boolean;
  remark: string | null;
}

export interface ImportReport {
  total: number;
  valid: number;
  rows: PreviewRow[];
  duplicates: DuplicateRow[];
  compounds: CompoundRow[];
  invalid: InvalidRow[];
  newCategories: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  newCategories: string[];
}

/** 表格本身无法解析（格式错误、表头不符等）时抛出，由接口转成 400 */
export class ImportParseError extends Error {}

/** 导入参数不满足要求（如拆分时缺少各变体数量）时抛出，由接口转成 400 */
export class ImportInputError extends Error {}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const text = cellText(value).replace(/,/g, "");
  return text === "" ? Number.NaN : Number(text);
}

/** 规格形如 10*26*8，取前三段数字；解析失败返回 null */
function parseSpec(raw: string): { innerDiameter: number; outerDiameter: number; height: number } | null {
  const first = raw.split("/")[0];
  const nums = first
    .split("*")
    .slice(0, 3)
    .map((part) => Number(part.replace(/[^\d.-]/g, "")));
  if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) return null;
  return { innerDiameter: nums[0], outerDiameter: nums[1], height: nums[2] };
}

/** 复合规格中除第一组外的其余高度，如 2*5*2.0 (开)/2.5 (ZZ) → [2.5] */
export function extraHeights(raw: string): number[] {
  if (!raw.includes("/")) return [];
  return raw
    .split("/")
    .slice(1)
    .map((part) => Number(part.replace(/[^\d.-]/g, "")))
    .filter((n) => Number.isFinite(n));
}

/** 从规格段括号中提取简称，如 2*5*2.0 (开) → 开 */
function segmentLabel(segment: string, index: number): string {
  const matched = segment.match(/[（(]([^）)]+)[）)]/);
  return matched ? matched[1].trim() : `第 ${index + 1} 组`;
}

/** 复合规格各变体的简称，如 ["开", "ZZ"] */
export function variantLabels(raw: string): string[] {
  return raw.split("/").map((segment, index) => segmentLabel(segment, index));
}

function rowKey(row: { category: string; name: string; model: string }) {
  return `${row.category}|${row.name}|${row.model}`;
}

function mergeRemark(remark: string | null, extra: string | null): string | null {
  return [remark, extra].filter(Boolean).join("；") || null;
}

/** 读取并校验表格，返回合法行与不合法行（不访问数据库） */
export async function parseItemWorkbook(
  buffer: Buffer,
): Promise<{ rows: ParsedRow[]; invalid: InvalidRow[] }> {
  let table: unknown[][];
  try {
    table = (await readSheet(buffer)) as unknown[][];
  } catch {
    throw new ImportParseError("无法解析该文件，请确认是 .xlsx 格式");
  }
  if (!table.length) throw new ImportParseError("表格内容为空");

  const header = (table[0] || []).map(cellText);
  if (HEADERS.some((h, i) => header[i] !== h)) {
    throw new ImportParseError(`表头不符合模板，应为：${HEADERS.join(" / ")}`);
  }

  const rows: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i] || [];
    const row = i + 1; // 与 Excel 行号保持一致（第 1 行是表头）
    const category = cellText(cells[0]);
    const name = cellText(cells[1]);
    const rawSpec = cellText(cells[2]);
    const model = cellText(cells[3]);
    const price = cellNumber(cells[4]);
    const rawQuantity = cellText(cells[5]);
    // 支持 20/10 这种多数量写法，对应复合规格的多个变体
    const quantities =
      rawQuantity === "" ? [] : rawQuantity.split("/").map((part) => Number(part.trim()));
    const remark = cellText(cells[6]) || null;

    // 整行为空则忽略（含仅有备注的说明行）
    if (
      !category &&
      !name &&
      !rawSpec &&
      !model &&
      cellText(cells[4]) === "" &&
      rawQuantity === "" &&
      !remark
    ) {
      continue;
    }

    if (rows.length + invalid.length >= MAX_IMPORT_ROWS) {
      throw new ImportParseError(`单次最多导入 ${MAX_IMPORT_ROWS} 行，请拆分表格后再试`);
    }

    const reasons: string[] = [];
    if (!category) reasons.push("类目为空");
    if (!name) reasons.push("存货全名为空");
    if (!model) reasons.push("型号为空");
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
      reasons.push("最低售价不是有效金额");
    }
    const quantityValid =
      quantities.length > 0 &&
      quantities.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_QUANTITY);
    if (!quantityValid) {
      reasons.push("库存数量必须是非负整数，多个变体可用 20/10 表示");
    }
    const dims = parseSpec(rawSpec);
    if (!dims) reasons.push("规格无法解析为「内径*外径*高度」");

    const compound = rawSpec.includes("/");
    const variantCount = 1 + extraHeights(rawSpec).length;
    if (quantityValid && compound && quantities.length !== 1 && quantities.length !== variantCount) {
      reasons.push(`复合规格需填写 1 个或 ${variantCount} 个库存数量`);
    }
    if (quantityValid && !compound && quantities.length !== 1) {
      reasons.push("非复合规格只能填写一个库存数量");
    }

    if (reasons.length > 0) {
      invalid.push({ row, reason: reasons.join("；") });
      continue;
    }

    const key = rowKey({ category, name, model });
    const prev = seen.get(key);
    if (prev) {
      invalid.push({ row, reason: `与第 ${prev} 行的类目/名称/型号重复` });
      continue;
    }
    seen.set(key, row);

    rows.push({
      row,
      category,
      name,
      model,
      price,
      quantity: quantities[0],
      quantities,
      remark,
      innerDiameter: dims!.innerDiameter,
      outerDiameter: dims!.outerDiameter,
      height: dims!.height,
      compound,
      rawSpec,
    });
  }

  return { rows, invalid };
}

/** 结合数据库现状生成导入预览：重复项、复合规格、非法行、待新建类目 */
export async function buildImportReport(
  parsed: { rows: ParsedRow[]; invalid: InvalidRow[] },
  client: PrismaClient,
): Promise<ImportReport> {
  const models = [...new Set(parsed.rows.map((r) => r.model))];
  const [items, categories] = await Promise.all([
    models.length
      ? client.item.findMany({
          where: { model: { in: models } },
          select: {
            id: true,
            name: true,
            model: true,
            quantity: true,
            price: true,
            category: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    client.category.findMany({ select: { name: true } }),
  ]);

  const existing = new Map(
    items.map((item) => [
      rowKey({ category: item.category.name, name: item.name, model: item.model }),
      item,
    ]),
  );
  const existingCategories = new Set(categories.map((c) => c.name));

  const duplicates: DuplicateRow[] = [];
  const compounds: CompoundRow[] = [];
  const newCategories = new Set<string>();

  for (const row of parsed.rows) {
    const found = existing.get(rowKey(row));
    if (found) {
      duplicates.push({
        row: row.row,
        category: row.category,
        name: row.name,
        model: row.model,
        currentQuantity: found.quantity,
        currentPrice: Number(found.price),
      });
    }
    if (!existingCategories.has(row.category)) newCategories.add(row.category);
    if (row.compound) {
      compounds.push({
        row: row.row,
        name: row.name,
        model: row.model,
        raw: row.rawSpec,
        parsed: {
          innerDiameter: row.innerDiameter,
          outerDiameter: row.outerDiameter,
          height: row.height,
        },
        extraHeights: extraHeights(row.rawSpec),
        heights: [row.height, ...extraHeights(row.rawSpec)],
        quantities: row.quantities,
        labels: variantLabels(row.rawSpec),
      });
    }
  }

  return {
    total: parsed.rows.length + parsed.invalid.length,
    valid: parsed.rows.length,
    rows: parsed.rows.map((row) => ({
      row: row.row,
      category: row.category,
      name: row.name,
      model: row.model,
      price: row.price,
      quantities: row.quantities,
      heights: [row.height, ...extraHeights(row.rawSpec)],
      labels: variantLabels(row.rawSpec),
      innerDiameter: row.innerDiameter,
      outerDiameter: row.outerDiameter,
      compound: row.compound,
      remark: row.remark,
    })),
    duplicates,
    compounds,
    invalid: parsed.invalid,
    newCategories: [...newCategories],
  };
}

/** 解析客户端传来的选项，非法值回落到安全默认 */
export function normalizeImportOptions(raw: string | null): ImportPayload {
  const defaults: ImportPayload = { duplicates: "skip", compound: "first", invalid: "abort" };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<ImportPayload>;
    const quantities: Record<string, number[]> = {};
    if (parsed.quantities && typeof parsed.quantities === "object") {
      for (const [key, value] of Object.entries(parsed.quantities)) {
        if (!/^\d+$/.test(key) || !Array.isArray(value)) continue;
        const nums = value.map((n) => Number(n));
        if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_QUANTITY)) {
          quantities[key] = nums;
        }
      }
    }
    return {
      duplicates:
        parsed.duplicates === "update" || parsed.duplicates === "create"
          ? parsed.duplicates
          : "skip",
      compound:
        parsed.compound === "split" || parsed.compound === "skip" ? parsed.compound : "first",
      invalid: parsed.invalid === "skip" ? "skip" : "abort",
      ...(Object.keys(quantities).length > 0 ? { quantities } : {}),
    };
  } catch {
    return defaults;
  }
}

/**
 * 取该行各变体的库存数量：
 * 单变体直接用表格数量；多变体优先用前端按变体填写的数量，
 * 其次用表格中 20/10 写法的数量，都不满足时要求用户补填
 */
function resolveQuantities(row: ParsedRow, count: number, options: ImportPayload): number[] {
  if (count === 1) return [row.quantity];
  const provided = options.quantities?.[String(row.row)];
  if (provided?.length === count) return provided;
  if (row.quantities.length === count) return row.quantities;
  throw new ImportInputError(`第 ${row.row} 行有 ${count} 个变体，请分别填写库存数量`);
}

/** 按选项写入：自动补建类目、处理重复与复合规格，整体在一个事务内完成 */
export async function applyItemImport(
  parsed: { rows: ParsedRow[] },
  options: ImportPayload,
  client: PrismaClient,
): Promise<ImportResult> {
  return client.$transaction(
    async (tx) => {
      // 复合规格被跳过时，不为其创建空分类
      const creatableRows = parsed.rows.filter(
        (r) => !(r.compound && options.compound === "skip"),
      );

      const existingCategories = new Set(
        (await tx.category.findMany({ select: { name: true } })).map((c) => c.name),
      );
      // 用 createMany + skipDuplicates 处理并发创建同名分类的情况
      const newCategories = [
        ...new Set(creatableRows.map((r) => r.category)),
      ].filter((name) => !existingCategories.has(name));
      if (newCategories.length > 0) {
        await tx.category.createMany({
          data: newCategories.map((name) => ({ name })),
          skipDuplicates: true,
        });
      }

      const categories = await tx.category.findMany({ select: { id: true, name: true } });
      const categoryIds = new Map(categories.map((c) => [c.name, c.id]));

      const models = [...new Set(parsed.rows.map((r) => r.model))];
      const items = models.length
        ? await tx.item.findMany({
            where: { model: { in: models } },
            select: {
              id: true,
              name: true,
              model: true,
              height: true,
              category: { select: { name: true } },
            },
          })
        : [];
      // 同一「类目+名称+型号」可能存在多条（拆分变体或重复导入），按高度区分
      const existing = new Map<string, Array<{ id: string; height: number }>>();
      for (const item of items) {
        const key = rowKey({ category: item.category.name, name: item.name, model: item.model });
        const list = existing.get(key);
        if (list) list.push({ id: item.id, height: item.height });
        else existing.set(key, [{ id: item.id, height: item.height }]);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of parsed.rows) {
        const heights =
          row.compound && options.compound === "split"
            ? [row.height, ...extraHeights(row.rawSpec)]
            : [row.height];

        if (row.compound && options.compound === "skip") {
          skipped += heights.length;
          continue;
        }

        const found = existing.get(rowKey(row)) ?? [];
        // 重复项整体跳过的行不需要数量，避免强制用户填写将被丢弃的变体数量
        if (found.length > 0 && options.duplicates === "skip") {
          skipped += heights.length;
          continue;
        }

        const quantities = resolveQuantities(row, heights.length, options);

        const remark = mergeRemark(row.remark, row.compound ? `规格：${row.rawSpec}` : null);
        const base = {
          name: row.name,
          model: row.model,
          categoryId: categoryIds.get(row.category)!,
          price: row.price,
          remark,
          innerDiameter: row.innerDiameter,
          outerDiameter: row.outerDiameter,
        };

        // 已存在且选择更新：按高度逐个匹配变体，匹配不到的高度补建
        if (found.length > 0 && options.duplicates === "update") {
          const used = new Set<string>();
          const pending: number[] = [];
          for (let index = 0; index < heights.length; index += 1) {
            const height = heights[index];
            const target = found.find((item) => item.height === height && !used.has(item.id));
            if (target) {
              used.add(target.id);
              await tx.item.update({
                where: { id: target.id },
                data: { price: row.price, quantity: quantities[index] },
              });
              updated += 1;
            } else {
              pending.push(index);
            }
          }
          if (pending.length > 0) {
            await tx.item.createMany({
              data: pending.map((index) => ({
                ...base,
                quantity: quantities[index],
                height: heights[index],
              })),
            });
            created += pending.length;
          }
          continue;
        }

        await tx.item.createMany({
          data: heights.map((height, index) => ({
            ...base,
            quantity: quantities[index],
            height,
          })),
        });
        created += heights.length;
      }

      return { created, updated, skipped, newCategories };
    },
    { timeout: 30_000 },
  );
}
