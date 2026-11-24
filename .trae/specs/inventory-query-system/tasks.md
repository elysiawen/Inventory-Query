# 库存查询系统 - 实施计划

## Task 1: 项目初始化与基础设施
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 初始化 Next.js（App Router）项目于 `d:\CodeSpace\GG`，配置 TypeScript、Tailwind/UI 库。
  - 接入 Prisma ORM，配置 PostgreSQL 连接（`DATABASE_URL`），生成 PrismaClient 单例。
  - 建立目录分层：`src/app`（页面 + API Route Handlers）、`src/lib`（prisma、auth、jwt、password、upload）、`src/components`。
  - 实现 JWT 签发/校验工具与密码哈希工具（bcryptjs），鉴权走 `Authorization: Bearer <token>` 头部，不依赖 Cookie/Session。
  - 提供 `.env.example`（`DATABASE_URL`、`JWT_SECRET`）与 `package.json` 启动脚本，满足本地一键安装启动。
- **Acceptance Criteria Addressed**: AC-12, NFR-4, NFR-5
- **Test Requirements**:
  - `rule` TR-1.1: 执行 `npm install` 与 `npm run dev` 后服务在本地端口正常启动，无依赖报错；evidence: 终端启动输出与首页可访问。
  - `rule` TR-1.2: JWT 工具可签发并校验 token，篡改/过期 token 校验失败；evidence: 单元逻辑或脚本调用输出。
- **Completion Evidence**:
  - TR-1.1: `npm install` 成功生成 node_modules；`npm run dev` 启动后首页 http://localhost:3000 返回 200、`/login` 返回 200（内容长度 6495）。
  - TR-1.2: 运行 `npx tsx verify-jwt.tmp.ts`，有效 token 解析出 role=ADMIN，篡改 token 返回 null，输出 `JWT VERIFY: PASS`（临时脚本已删除）。
  - 附加：`npx prisma generate` 成功生成 Prisma Client v5.22.0；`npx tsc --noEmit` 零类型错误。

## Task 2: 数据模型、迁移与种子数据
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 编写 Prisma schema，定义四张表：
    - `User`: id, username(唯一), passwordHash, role(ADMIN/USER), createdAt, updatedAt
    - `Category`: id, name(唯一), createdAt
    - `Item`: id, name, model, categoryId(FK), image, price(Decimal), remark, supplier, innerDiameter(Float), outerDiameter(Float), height(Float), quantity(Int), createdAt, updatedAt
    - `StockLog`: id, itemId(FK), type(IN/OUT), quantity(Int), operatorId(FK→User), remark, createdAt
  - 生成并执行迁移；外键与索引配置合理（如 Item.categoryId、StockLog.itemId）。
  - 编写种子脚本：创建默认管理员账号（账号 `admin`，密码可配置，默认 `admin123`）。
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**:
  - `rule` TR-2.1: `npx prisma migrate dev` 成功，数据库中存在 User/Category/Item/StockLog 四张表及外键；evidence: 迁移输出 + `prisma studio`/查询验证表结构。
  - `rule` TR-2.2: 种子执行后存在一条 role=ADMIN 的用户记录；evidence: 数据库查询 User 表。
- **Completion Evidence**:
  - TR-2.1: 因数据库用户 `111` 无 `CREATEDB` 权限，`prisma migrate dev`（需影子库）报 P3014；改用 `npx prisma db push` 成功同步 schema，输出 `Your database is now in sync with your Prisma schema`，四张表（User/Category/Item/StockLog）及外键已在库 `111` 中创建。
  - TR-2.2: `npx prisma db seed` 执行成功，输出 `Seeded admin user: admin / admin123`。

## Task 3: 鉴权模块（登录 + 角色守卫 + 前端路由保护）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 实现 `POST /api/auth/login`：校验账号密码，成功返回 `{ token, user:{id,username,role} }`，失败返回 401。
  - 实现服务端鉴权工具：从 `Authorization` 头解析并校验 JWT，将 `user` 注入请求上下文。
  - 实现角色守卫 `requireAdmin` / `requireUser`，未登录返回 401，角色不符返回 403。
  - 前端登录页：账号密码表单，登录成功存 token 到 localStorage；实现路由守卫——未登录跳转登录页，普通用户访问后台路由跳转前台。
  - 提供一个轻量后台布局（侧边栏导航）与前台布局。
- **Acceptance Criteria Addressed**: AC-1, AC-12, NFR-1
- **Test Requirements**:
  - `rule` TR-3.1: 正确账号密码登录返回 200 与 token；错误密码返回 401；evidence: curl/接口调用返回。
  - `rule` TR-3.2: 不带 token 请求受保护接口返回 401；带普通用户 token 请求管理员接口返回 403；带管理员 token 正常返回；evidence: 接口调用状态码。
  - `rule` TR-3.3: 纯 HTTP 客户端（curl）可完成登录并携带 token 调用查询类接口，无需 Cookie；evidence: curl 命令链成功。

## Task 4: 账号管理（管理员）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 实现管理员账号管理 API：`GET /api/users`（列表）、`POST /api/users`（创建普通用户）、`PUT /api/users/[id]`（编辑/改密/启用禁用）、`DELETE /api/users/[id]`（删除，不可删自己/最后一个管理员）。
  - 所有接口受 `requireAdmin` 保护；密码哈希存储。
  - 后台「账号管理」页面：用户列表、新增弹窗、编辑、删除。
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-4.1: 管理员创建一个普通用户后，该账号可在前台登录成功（获得 token）；evidence: 创建后用新账号调用登录接口成功。
  - `rule` TR-4.2: 普通用户 token 调用 `/api/users` 任意写接口返回 403；evidence: 接口状态码。
  - `rule` TR-4.3: 管理员删除自己或最后一个管理员被拒绝；evidence: 接口返回错误且记录仍在。

## Task 5: 分类管理（管理员）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 实现分类 API：`GET /api/categories`、`POST`、`PUT /[id]`、`DELETE /[id]`，均受 `requireAdmin` 保护。
  - 删除分类前检查是否有 Item 引用该 categoryId，若有则拒绝并返回明确提示（不级联删除物品）。
  - 后台「分类管理」页面：列表、新增、编辑、删除（带确认与引用提示）。
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-5.1: 新增/编辑分类后列表正确反映变更；evidence: 接口返回与数据库查询。
  - `rule` TR-5.2: 删除一个被物品引用的分类返回错误（如 409）且分类与关联物品均保留；evidence: 删除接口返回 + 数据仍存在。
  - `rule` TR-5.3: 普通用户调用分类写接口返回 403；evidence: 状态码。

## Task 6: 物品管理（管理员）+ 图片上传
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - 实现图片上传 API：`POST /api/upload` 接收 multipart 单图，存于本地 `public/uploads/`（或项目内 uploads 目录并静态暴露），返回可访问 URL；受登录保护。
  - 实现物品 API：`GET /api/items`（后台列表）、`POST /api/items`（上架）、`PUT /api/items/[id]`、`DELETE /api/items/[id]`，均受 `requireAdmin`；字段含名称、型号、分类、图片、单价、备注、供应商、内径、外径、高度、初始数量。
  - 后台「物品管理」页面：列表、上架表单（含图片上传预览）、编辑、删除。
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-6.1: 上架物品填写全部字段后创建成功，前台/查询接口返回该物品且所有字段值与输入一致（含尺寸三数值与图片 URL）；evidence: 上架后查询接口返回体。
  - `rule` TR-6.2: 编辑物品某字段后，查询返回更新值；删除物品后查询无此物品；evidence: 编辑/删除前后查询结果对比。
  - `rule` TR-6.3: 上传的图片可通过返回的 URL 在浏览器访问；evidence: 浏览器/curl 访问图片 URL 返回 200。
  - `rule` TR-6.4: 普通用户调用物品写接口返回 403；evidence: 状态码。

## Task 7: 入库/出库（管理员）+ 事务一致性
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  - 实现 `POST /api/items/[id]/stock-in` 与 `POST /api/items/[id]/stock-out`，请求体 `{ quantity, remark? }`，受 `requireAdmin` 保护。
  - 在单个 Prisma 事务中：更新 `Item.quantity`（入库加、出库减）并写入一条 `StockLog`（type、quantity、operatorId、remark、createdAt）。
  - 出库前校验 `quantity <= 当前库存`，否则拒绝且不产生任何变更。
  - 后台物品列表/详情提供「入库」「出库」操作入口（弹窗输入数量）。
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-8, NFR-2, NFR-3
- **Test Requirements**:
  - `rule` TR-7.1: 对数量为 N 的物品入库 +X、出库 -Y（Y≤N+X）后，数量变为 N+X-Y，且 StockLog 中存在对应入库、出库两条记录（含操作人与时间）；evidence: 操作后查询物品数量与流水列表。
  - `rule` TR-7.2: 对数量为 N 的物品尝试出库 N+1，接口返回错误，物品数量仍为 N，StockLog 无新增记录；evidence: 接口返回 + 数量与流水核对。
  - `rule` TR-7.3: 核对实现使用事务包裹「更新数量 + 写流水」，多次操作后数量恒等于 初始+入库总和-出库总和；evidence: 代码审查 + 数据核对。

## Task 8: 历史流水查询（管理员）
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: Task 7
- **Description**:
  - 实现 `GET /api/stock-logs?itemId=&from=&to=&page=&pageSize=`，受 `requireAdmin` 保护，支持按物品、时间范围筛选与分页，返回关联物品名称/型号与操作人。
  - 后台「流水记录」页面：筛选表单 + 分页列表。
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-8.1: 按 itemId 筛选只返回该物品流水；按 from/to 时间范围筛选只返回区间内记录；evidence: 带参数查询返回与数据库核对。
  - `rule` TR-8.2: 分页参数 page/pageSize 生效，返回总数与当前页数据；evidence: 分页查询返回体。
  - `rule` TR-8.3: 普通用户调用流水接口返回 403；evidence: 状态码。

## Task 9: 前台查询（普通用户）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  - 实现公开查询 API `GET /api/items/search?keyword=&categoryId=&innerMin=&innerMax=&outerMin=&outerMax=&heightMin=&heightMax=&page=&pageSize=`，受 `requireUser`（登录即可，含管理员）保护。
  - keyword 模糊匹配名称与型号；分类精确匹配；尺寸三字段分别按 min/max 范围筛选；分页返回。
  - 返回字段：名称、型号、分类名、内径、外径、高度、数量、单价、图片、备注、供应商（不含敏感管理字段）。
  - 前台「库存查询」页面：搜索框、分类下拉、内径/外径/高度范围输入、分页、结果列表（含图片与字段展示）。
- **Acceptance Criteria Addressed**: AC-10, AC-11
- **Test Requirements**:
  - `rule` TR-9.1: 组合 keyword + 分类 + 尺寸范围筛选，返回结果同时满足全部条件，分页正确；evidence: 构造数据后带参数查询验证返回条数与内容。
  - `rule` TR-9.2: 查询返回字段包含名称、型号、分类、内径、外径、高度、数量、单价、图片、备注、供应商，无遗漏；evidence: 返回体字段校验。
  - `rule` TR-9.3: 普通用户 token 调用任意后台写接口（上架/出入库/删分类/删用户）返回 403；evidence: 各写接口状态码。

## Task 10: 端到端联调与验收标准逐项验证
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 4, Task 5, Task 6, Task 7, Task 8, Task 9
- **Description**:
  - 完整启动服务，按 `spec.md` 的 AC-1 至 AC-12 逐项执行验证（用 curl/接口调用 + 浏览器操作），记录每条 AC 的证据。
  - 对 AC-13、AC-14 两项 rubric 评分并记录依据。
  - 修复验证中发现的缺陷，直至所有 AC 通过。
- **Acceptance Criteria Addressed**: AC-1 ~ AC-14（全部）
- **Test Requirements**:
  - `rule` TR-10.1: AC-1 至 AC-12 全部通过，每条有可复现的证据（接口返回/截图/命令输出）；evidence: 验证记录。
  - `rubric` TR-10.2: 代码结构与 API 设计质量（AC-13）；scale 1-5；anchors 1=耦合混乱/3=基本可用/5=分层清晰API规范；threshold >=4；evidence: 目录结构与路由审查。
  - `rubric` TR-10.3: 前后台可用性（AC-14）；scale 1-5；anchors 1=残缺报错/3=可用粗糙/5=顺畅清晰；threshold >=4；evidence: 实际浏览各页面操作。
