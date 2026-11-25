/* eslint-disable */
/**
 * 独立清理脚本（不参与项目构建，可直接 node 运行）
 *
 * 用法：node clear.js [选项]
 *
 * 默认会清空：物品 + 出入库流水 + 分类 + public/uploads 下的图片文件，保留所有账号
 *
 * 选项：
 *   --keep-categories   保留分类（只删物品和流水）
 *   --users             同时删除普通账号（管理员保留）及其头像
 *   --keep-only <账号>  配合 --users，只保留指定的管理员账号，其余全部删除
 *   --no-images         不删除图片文件（只清数据库）
 *   --all               等同于 --users（默认已删除分类和图片）
 *   --yes, -y           跳过确认，直接执行
 *   --help, -h          显示帮助
 *
 * 示例：
 *   node clear.js                     清空物品、流水、分类和图片，账号保留
 *   node clear.js --keep-categories   只清物品和流水，分类保留
 *   node clear.js --users --yes       清空全部业务数据 + 普通账号，不询问
 *   node clear.js --users --keep-only admin
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

if (has("--help") || has("-h")) {
  console.log(
    [
      "用法：node clear.js [选项]",
      "",
      "默认清空物品、出入库流水、分类和图片文件，保留所有账号。",
      "",
      "  --keep-categories   保留分类",
      "  --users             同时删除普通账号（管理员保留）",
      "  --keep-only <账号>  配合 --users，只保留指定管理员",
      "  --no-images         不删除图片文件",
      "  --yes, -y           跳过确认",
      "  --help, -h          显示帮助",
    ].join("\n"),
  );
  process.exit(0);
}

const keepCategories = has("--keep-categories") || has("--keep-cats");
const deleteUsers = has("--users") || has("--all");
const deleteImages = !has("--no-images");
const skipConfirm = has("--yes") || has("-y");
const keepOnlyIndex = args.indexOf("--keep-only");
const keepOnly = keepOnlyIndex >= 0 ? args[keepOnlyIndex + 1] : null;

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");

const prisma = new PrismaClient();

/** /uploads/xxx 形式的本地相对路径转成绝对路径，越界或非本地上传路径返回 null */
function localFile(url) {
  if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const target = path.resolve(publicDir, "." + url);
  if (!target.startsWith(uploadsDir)) return null;
  return target;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

async function main() {
  let keepUserId = null;
  if (deleteUsers && keepOnly) {
    const keep = await prisma.user.findFirst({
      where: { OR: [{ id: keepOnly }, { username: keepOnly }] },
    });
    if (!keep || keep.role !== "ADMIN") {
      throw new Error(`--keep-only 指定的账号「${keepOnly}」不存在或不是管理员`);
    }
    keepUserId = keep.id;
  }

  const userWhere = deleteUsers
    ? keepUserId
      ? { id: { not: keepUserId } }
      : { role: "USER" }
    : null;

  const [itemCount, logCount, categoryCount, userCount] = await Promise.all([
    prisma.item.count(),
    prisma.stockLog.count(),
    prisma.category.count(),
    userWhere ? prisma.user.count({ where: userWhere }) : Promise.resolve(0),
  ]);

  // 物品会被全部删除，其图片必然可清理；保留下来的账号头像需要继续保留。
  // 与删除后的清扫逻辑保持一致：uploads 下未被保留账号引用的文件都会被删除
  const remainingUsers = deleteUsers
    ? await prisma.user.findMany({
        where: keepUserId ? { id: keepUserId } : { role: "ADMIN" },
        select: { avatar: true },
      })
    : await prisma.user.findMany({ select: { avatar: true } });
  const keptAvatars = new Set(remainingUsers.map((u) => localFile(u.avatar)).filter(Boolean));
  const removableImages = deleteImages
    ? walkFiles(uploadsDir).filter(
        (file) => path.basename(file) !== ".gitkeep" && !keptAvatars.has(file),
      )
    : [];

  const nothingToDo =
    itemCount === 0 &&
    logCount === 0 &&
    (keepCategories || categoryCount === 0) &&
    (!deleteUsers || userCount === 0) &&
    removableImages.length === 0;
  if (nothingToDo) {
    console.log("当前没有需要清理的数据，脚本结束。");
    return;
  }

  console.log("将执行以下清理：");
  console.log(`  - 物品：${itemCount} 条`);
  console.log(`  - 出入库流水：${logCount} 条`);
  console.log(`  - 分类：${keepCategories ? "保留" : `${categoryCount} 个`}`);
  console.log(
    `  - 账号：${deleteUsers ? `删除 ${userCount} 个${keepUserId ? "（仅保留指定管理员）" : "普通账号"}` : "保留"}`,
  );
  console.log(`  - 图片文件：${deleteImages ? `删除 ${removableImages.length} 个` : "保留"}`);

  if (!skipConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("确认继续？此操作不可撤销 (y/N) ");
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("已取消。");
      return;
    }
  }

  const ops = [
    prisma.stockLog.deleteMany({}),
    prisma.item.deleteMany({}),
    ...(keepCategories ? [] : [prisma.category.deleteMany({})]),
    ...(userWhere ? [prisma.user.deleteMany({ where: userWhere })] : []),
  ];
  await prisma.$transaction(ops);

  let removedFiles = 0;
  if (deleteImages) {
    // 删除已移除记录引用的图片，然后清理 uploads 下所有无人引用的残留文件
    const remainingItems = await prisma.item.findMany({ select: { image: true } });
    const remainingUsers = await prisma.user.findMany({ select: { avatar: true } });
    const referenced = new Set(
      [...remainingItems.map((i) => i.image), ...remainingUsers.map((u) => u.avatar)]
        .map(localFile)
        .filter(Boolean),
    );

    for (const file of walkFiles(uploadsDir)) {
      if (path.basename(file) === ".gitkeep" || referenced.has(file)) continue;
      try {
        fs.unlinkSync(file);
        removedFiles += 1;
      } catch {
        // 文件被占用或已不存在时忽略
      }
    }
  }

  console.log(
    [
      "",
      "清理完成：",
      `  物品 -${itemCount}，流水 -${logCount}`,
      keepCategories ? "  分类已保留" : `  分类 -${categoryCount}`,
      deleteUsers ? `  账号 -${userCount}` : "  账号已保留",
      deleteImages ? `  图片文件 -${removedFiles}` : "  图片文件已保留",
    ].join("\n"),
  );
}

main()
  .catch((e) => {
    console.error("清理失败：", e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
