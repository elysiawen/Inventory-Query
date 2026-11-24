/* eslint-disable */
/**
 * 独立演示数据填充脚本（不参与项目构建）
 * 用法：node fill.js [条数]        默认 1000
 * 需在与 node_modules 同级的目录执行（项目根或部署目录），以便解析 @prisma/client
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    name: "轴承",
    products: ["深沟球轴承", "圆锥滚子轴承", "推力球轴承", "调心滚子轴承", "外球面轴承"],
    models: ["6204-2RS", "6206-ZZ", "6308", "30206", "22310CA", "UC205"],
  },
  {
    name: "密封圈",
    products: ["O型密封圈", "骨架油封", "唇形密封圈", "Y型密封圈"],
    models: ["NBR-70", "FKM-25", "TC-30x52x7", "UN-40x50x6"],
  },
  {
    name: "紧固件",
    products: ["六角螺栓", "内六角螺钉", "平垫圈", "弹簧垫圈", "尼龙锁紧螺母"],
    models: ["M6x20", "M8x30", "M10x40", "M12x50", "M16x60"],
  },
  {
    name: "管件",
    products: ["不锈钢弯头", "等径三通", "法兰盘", "异径管", "管帽"],
    models: ["DN25", "DN50", "DN80", "DN100", "DN150"],
  },
  {
    name: "阀门",
    products: ["球阀", "闸阀", "截止阀", "蝶阀", "止回阀"],
    models: ["Q11F-16P", "Z41H-16C", "J41H-25", "D71X-10", "H44H-16C"],
  },
  {
    name: "电气元件",
    products: ["小型断路器", "交流接触器", "中间继电器", "端子排", "行程开关"],
    models: ["DZ47-63", "CJX2-2510", "MY2NJ", "UK-2.5B", "LX19-111"],
  },
  {
    name: "工具",
    products: ["扳手套装", "游标卡尺", "内六角扳手", "螺丝刀套装", "卷尺"],
    models: ["8-24mm", "0-150mm", "1.5-10mm", "32件套", "5m"],
  },
  {
    name: "润滑与耗材",
    products: ["锂基润滑脂", "齿轮油", "液压油", "切削液", "工业清洗剂"],
    models: ["2#", "L-CKC220", "L-HM46", "10L", "20L"],
  },
];

const SUPPLIERS = ["华东物资", "北方机电", "恒信五金", "长江工贸", "中科密封", "瑞达电气", "精工轴承"];
const REMARK = "演示数据";

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randPrice() {
  return Math.round((Math.random() * 5000 + 1) * 100) / 100;
}

async function main() {
  const raw = Number(process.argv[2] || 1000);
  const count = Number.isInteger(raw) && raw > 0 ? raw : 1000;

  const categoryRecords = [];
  for (const c of CATEGORIES) {
    categoryRecords.push(
      await prisma.category.upsert({
        where: { name: c.name },
        update: {},
        create: { name: c.name },
      }),
    );
  }

  const before = await prisma.item.count();

  const rows = Array.from({ length: count }, (_, i) => {
    const index = randInt(0, CATEGORIES.length - 1);
    const category = CATEGORIES[index];
    const inner = randInt(5, 200);
    const outer = inner + randInt(5, 200);
    const time = new Date(Date.now() - i * 60 * 1000);

    return {
      name: pick(category.products),
      model: pick(category.models),
      categoryId: categoryRecords[index].id,
      price: randPrice(),
      innerDiameter: inner,
      outerDiameter: outer,
      height: randInt(3, 150),
      quantity: randInt(0, 2000),
      supplier: pick(SUPPLIERS),
      remark: REMARK,
      image: null,
      createdAt: time,
      updatedAt: time,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    await prisma.item.createMany({ data: rows.slice(i, i + 500) });
  }

  const after = await prisma.item.count();
  console.log(`已插入 ${count} 条物品：${before} -> ${after}`);
  console.log(`分类：${CATEGORIES.map((c) => c.name).join("、")}`);
  console.log(`清理命令：DELETE FROM "Item" WHERE remark = '${REMARK}';`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
