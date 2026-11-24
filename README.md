# Inventory-Query 库存物资管理系统

面向内部物资查询与出入库管理的全栈项目：Next.js Web（查询端 + 管理后台）与 Taro 微信小程序共用一套 REST API 和 PostgreSQL 数据库。

## 功能

- 前台查询：关键词、分类、内径/外径/高度精确或范围筛选，多字段排序、分页
- 管理后台：物品（含图片上传、出入库）、分类、用户、流水记录、系统状态
- 个人中心：修改头像、用户名、密码（改密需验证原密码）
- 微信小程序：查询、物品/分类/用户/流水管理、系统状态
- 权限与安全：JWT + 每次回库校验、登录限流、最后管理员保护、并发出入库不超卖

## 技术栈

- Next.js 16（App Router）+ React + TypeScript + Tailwind CSS
- Prisma 5 + PostgreSQL
- Taro 4 + React（微信小程序）
- JWT（jsonwebtoken）+ bcryptjs

## 本地启动

```bash
npm install
cp .env.example .env        # 填写 DATABASE_URL、JWT_SECRET
npx prisma generate
npx prisma db push
npm run prisma:seed         # 默认管理员 admin / admin123
npm run dev                 # http://localhost:3000
```

生产构建：`npm run build && npm run start`。运行期上传的图片存放在 `public/uploads`，重新部署时不要删除该目录。

## 微信小程序

```bash
cd miniapp
npm install
# 在 .env.development / .env.production 中配置 TARO_APP_API_BASE
npm run dev:weapp           # 产物在 miniapp/dist
```

用微信开发者工具导入 `miniapp` 目录即可预览；真机调试需保证后端可访问并配置合法域名。

仓库中的 `project.config.json` 使用 `touristappid` 占位，真实小程序 AppID 请填在本地 `miniapp/project.private.config.json` 的 `appid` 字段（该文件已被 `.gitignore` 忽略，不会提交）。

## 目录结构

```
src/            Next.js 页面、组件与 API 路由
prisma/         数据模型、种子脚本、可选索引脚本
public/uploads/ 运行期上传的图片（不提交到仓库）
miniapp/        Taro 微信小程序
技术文档.md     架构、数据模型、接口、部署与常见问题
```

## 文档

完整技术文档见 [技术文档.md](./技术文档.md)，包含数据表结构、全部接口说明、认证机制、部署步骤、压测数据与常见问题。
