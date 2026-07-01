# Wiki.js SQL 直写建页与内容修复（pages / pageTree 底层操作）

> **优先用 GraphQL API 建页/改页**（见 `references/graphql-mutations.md`，当前 Admin Key 已就绪）。本文档是**数据库直写回退路径**：无可用 API Key、或需要批量 bootstrap 目录结构时使用。

Wiki.js v2 的 `pages` 表使用自增 ID（序列 `pages_id_seq`），`pageTree` 表管理层级关系。

## pages 表结构（关键字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer (auto) | 自增主键 |
| path | varchar | 路径，如 `home/ops/docker` |
| hash | varchar | 内容哈希（可用任意唯一值） |
| title | varchar | 标题 |
| content | text | Markdown 源码 |
| render | text | 渲染输出（可与 content 相同） |
| contentType | varchar | `markdown` |
| editorKey | varchar | `markdown` |
| localeCode | varchar | `zh` / `en` |
| authorId | integer | 用户 ID（1=管理员） |
| creatorId | integer | 同上 |
| publishStartDate | varchar | **不可为 NULL！** 空字符串 `''` |
| publishEndDate | varchar | **不可为 NULL！** 空字符串 `''` |

## 致命陷阱：新建页面必填字段清单

通过 SQL INSERT 创建页面，以下字段缺一不可，否则页面报错：

| 字段 | 必须值 | 缺失后果 |
|------|--------|---------|
| `localeCode` | `'zh'` | 页面不出现在目录树 |
| `isPublished` | `true` | 页面不可访问 |
| `editorKey` | `'markdown'` | 页面渲染失败 |
| `contentType` | `'markdown'` | 页面渲染失败 |
| `content` + `render` | 非空字符串 | "Page has no rendered version" |
| `publishStartDate` | `''` (空字符串) | 页面报错 |
| `publishEndDate` | `''` (空字符串) | 页面报错 |
| `authorId` / `creatorId` | `1` | 页面报错 |

**完整 INSERT 模板：**
```sql
INSERT INTO pages (path, hash, title, description, content, render,
  "isPublished", "contentType", "editorKey", "localeCode",
  "authorId", "creatorId", "createdAt", "updatedAt",
  extra, "publishStartDate", "publishEndDate")
VALUES ('home/xxx', 'h_xxx', '标题', '', '# 内容', '# 内容',
  true, 'markdown', 'markdown', 'zh',
  1, 1, NOW()::text, NOW()::text,
  '{}'::json, '', '');
```

**注意：即使文件夹页面（isFolder=true），content 和 render 也必须非空。**

## 致命陷阱：publishEndDate / publishStartDate

这两个字段必须是字符串（VARCHAR），**NULL 会导致页面报错**：
> "Expected a string at publishEndDate, got null"

插入时始终设为空字符串 `''`：
```sql
INSERT INTO pages (..., "publishEndDate", "publishStartDate", ...)
VALUES (..., '', '', ...);
```

## pageTree 表结构

| 字段 | 说明 |
|------|------|
| id | 手动分配（无自增） |
| path | 与 pages.path 一致 |
| depth | 路径中 `/` 的数量 |
| parent | **引用 pageTree.id**（不是 pages.id！） |
| pageId | 引用 pages.id |
| ancestors | JSON 数组，所有祖先 pageId |
| isFolder | 有子页面则为 true |

## 致命陷阱：localeCode 为空 → 页面不显示在目录树

通过 SQL INSERT 创建页面时，必须设置 `"localeCode" = 'zh'`（或其他有效 locale）。

**如果留空或 NULL，Wiki.js 重启重建 pageTree 时不会为该页面创建条目**，导致 GraphQL `tree` 查询返回只有 home，页面在侧边栏不显示。

```sql
-- ❌ 错误：localeCode 留空
INSERT INTO pages (...) VALUES (..., '', ...);

-- ✅ 正确
INSERT INTO pages (..., "localeCode", ...) VALUES (..., 'zh', ...);
```

## 批量创建页面流程

1. 先插入所有 `pages` 行（`RETURNING id` 获取自增 ID）
2. 建立 path → pageId 映射
3. 插入所有 `pageTree` 行，parent 暂时设为 NULL
4. 用 UPDATE 回填 parent 引用 pageTree.id：
   ```sql
   UPDATE "pageTree" c SET parent = p.id
   FROM "pageTree" p
   WHERE c.depth = p.depth + 1
     AND position(p.path || '/' in c.path) = 1
     AND c.parent IS NULL;
   ```
5. `docker restart wikijs` 让 Wiki.js 重建页面树

> **⚠️ 关键陷阱：Wiki.js 重启会从 `pages` 表重建 `pageTree`。** 手动 INSERT 的 pageTree 条目在重启后可能被覆盖/重排。正确流程：
> 1. 先 UPDATE `pages` 表的路径和内容
> 2. 再处理 `pageTree`（删除旧条目，插入新条目）
> 3. 最后 `docker restart wikijs` 让 Wiki.js 验证并同步 pageTree
>
> 如果只改 pageTree 不改 pages，重启后改动丢失。
>
> **SQL 换行陷阱**：通过 `docker exec` 执行含换行的 SQL 时，heredoc `$$` 引用经常失效。改用 PostgreSQL `E'...'` 转义字符串配合 `chr(10)` 或 `\n`：
> ```sql
> -- ✅ 可靠方式
> UPDATE pages SET content = E'# 标题\n\n内容...' WHERE id = 1;
>
> -- ❌ 不可靠（docker exec 中常失败）
> UPDATE pages SET content = $$多行
> 内容$$ WHERE id = 1;
> ```
>
> **`isFolder` 字段陷阱**：`isFolder` 只存在于 `pageTree` 表，不在 `pages` 表。查询时注意联表。

## 批量修复 NULL 日期字段
```sql
UPDATE pages SET "publishStartDate" = '', "publishEndDate" = ''
WHERE "publishEndDate" IS NULL;
```

## UPDATE 现有页面内容

更新已有页面（如填充首页）：

**关键：`render` 字段 = `content` 字段（都是 Markdown 原文）**

Wiki.js 客户端 Vue app 负责将 Markdown 渲染为 HTML。`render` 存 Markdown 原文是正确的，SSR 输出也是 Markdown 原文（与 `/home/ops` 等正常工作页面一致）：

```sql
-- 正确：render 等于 content
UPDATE pages SET
  content = '<markdown>',
  render = '<markdown>',   -- 与 content 相同，都是 Markdown
  hash = 'h<unique>',
  "updatedAt" = NOW()::text
WHERE id = <page_id>;
```

**致命陷阱 — render 不能是预渲染 HTML 也不能是 NULL：**

| render 值 | 后果 |
|-----------|------|
| = content（Markdown 原文） | ✅ 正常工作 |
| = 预渲染 HTML（如 Python markdown 输出） | ❌ Vue hydration 不匹配 → 白屏 |
| = NULL | ❌ 显示 "Page has no rendered version" 错误 |

**不要**用 Python `markdown.markdown()` 预渲染再写入 `render`。Wiki.js 用自己的渲染器在客户端完成转换。

如果 API Key 有 `write:pages` 权限，也可用 GraphQL mutation（见 `references/graphql-mutations.md`）：
```graphql
mutation {
  pages {
    update(id: 1, content: "...", title: "...", description: "...") {
      responseResult { succeeded errorCode message }
    }
  }
}
```
但 API Key 写权限默认只有 Admin 组能保证（Manager 组需额外配置 pageRules），没有写权限时返回 `Forbidden`。**当前 Admin 组 Key（id=<你的key_id>）已具备完整写权限，推荐用 GraphQL mutation 而非数据库直写。**

## 启动后首页为空

用 `references/pages-bootstrap.sql` 批量创建页面后，首页 (`id=1, path=home`) 的 `content` 只有占位文字：
```
# 首页

跨境电商技术运维知识库
```
需要手动填充首页内容（目录索引 + 各分类链接），参考上方的 UPDATE 示例。

## 内容换行符陷阱（SQL UPDATE 专用）

通过 SQL UPDATE 写入 `content` 时，如果 `\n` 是字面量（SQL 转义后变成两个字 `\` 和 `n`）而非真正换行符，Wiki.js SSR 渲染器会失败，输出完全空的 `<div id="root"><!----></div>`。

**正确姿势：用 PostgreSQL `$$` 引用保留真正换行：**

```sql
-- ❌ 错误：\\n 是字面量（导致 SSR 白屏）
UPDATE pages SET content = 'line1\\n\\nline2' WHERE id = 1;

-- ✅ 正确：用 $$ 包裹，内容中的换行就是真正的换行
UPDATE pages SET content = $$line1

line2$$ WHERE id = 1;
```

或用管道 + 文件输入方式（Python subprocess + `$$` quoting）避免 shell 转义层级。

**验证内容换行是否正确：**
```bash
# cat -A 会显示 $ 为行尾，literal \n 会显示为 \n
docker exec your-postgres-container psql -U wikijs -d wikijs -c "SELECT content FROM pages WHERE id = 1;" | cat -A
```

## SQL 执行陷阱

### heredoc `<< 'SQLEOF'` 在 `docker exec -i` 中静默失败

使用 `docker exec your-postgres-container psql ... << 'SQLEOF'` 形式的 heredoc 时，多行 `$$` 引用内容可能静默失败（不报错、不写入、返回空）。**解决方案：**

1. **逐条执行**：每个 SQL 语句单独 `docker exec ... -c "..."` 调用
2. **管道输入**：`echo "SQL" | docker exec -i your-postgres-container psql ...`
3. **Python subprocess**：用 Python 的 `subprocess.run` + `input=` 传参，避免 shell 转义

```python
import subprocess
sql = "UPDATE pages SET content = ... WHERE id = 1;"
subprocess.run(
    ['docker', 'exec', '-i', 'your-postgres-container', 'psql', '-U', 'wikijs', '-d', 'wikijs'],
    input=sql.encode(), capture_output=True)
```
