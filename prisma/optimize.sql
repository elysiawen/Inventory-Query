-- 可选性能优化：关键词模糊搜索（name/model 的 ILIKE '%x%'）加速
--
-- 说明：
--   1. 仅当数据量达到数万条、且关键词搜索较慢时执行本文件。
--   2. 需要 PostgreSQL 已安装 postgresql-contrib（提供 pg_trgm 扩展）。
--      检查命令：SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';
--      若查询为空，需先在数据库服务器安装 contrib 包并重启 PostgreSQL。
--   3. 本文件可重复执行（IF NOT EXISTS）。

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Item_name_trgm_idx"
  ON "Item" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Item_model_trgm_idx"
  ON "Item" USING gin ("model" gin_trgm_ops);
