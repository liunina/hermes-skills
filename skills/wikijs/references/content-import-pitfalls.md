# Wiki.js 内容导入陷阱

## 核心原则：永远不要通过 psql 输出 → 修改 → 写回

psql 的 `-A -t` 模式对超长行仍然会加 `+` 续行符和空格填充。任何 `SELECT → 修改 → UPDATE` 循环都会把 psql 格式化字符写进数据库。

**正确做法：** 用 Python 直接读取源文件 → 转换 → 写 SQL 文件 → 管道导入。

```python
# ✅ 正确：从源文件读取，不经过 psql
with open(source_file) as f:
    content = f.read()
content = transform(content)
escaped = content.replace("'", "''")
sql = f"UPDATE pages SET content = E'{escaped}' WHERE path = '{wiki_path}';"
with open('/tmp/import.sql', 'w') as f:
    f.write(sql)
subprocess.run(['docker','exec','-i','your-postgres-container','psql','-U','wikijs','-d','wikijs'],
    input=open('/tmp/import.sql','rb').read())
```

## Vue 模板表达式污染

Wiki.js 的 Vue 前端会把页面内容当作模板编译。以下模式会触发 ReferenceError 导致整页白屏：

| 模式 | 错误 | 修复 |
|------|------|------|
| `{{ }}` | 被当成 Vue 插值表达式 | `{ { } }`（花括号间加空格） |
| `$json` | 被当成 JS 变量 | `\$json`（反斜杠转义） |
| `$input`, `$workflow`, `$now` 等 | 同上 | 同上 |

**⚠️ 不要用 HTML 实体（`&#123;&#123;`）**——浏览器解码后 Vue 仍会解析。

## render 字段

Wiki.js v2.5.314 的 `render` 字段需要预渲染的 HTML。直接写 markdown 进去**不会自动触发渲染管线**。只有通过 UI 编辑保存才会渲染。

- `render = content`（markdown）→ SSR 输出原始 markdown，客户端渲染
- `render = ''`（空）→ SSR 无内容输出
- `render = HTML` → 正常 SSR 输出

批量导入后若 markdown 语法不生效，需逐个在 UI 中编辑保存触发渲染。

## pageRules 空数组陷阱

`pageRules: []` ≠ 无限制。Wiki.js 把空数组视为"无匹配规则 = 全部拒绝"。

```sql
-- ❌ 错误：所有页面 403
UPDATE groups SET "pageRules" = '[]' WHERE id = 2;

-- ✅ 正确：至少一条允许规则
UPDATE groups SET "pageRules" = '[{"id":"guest","roles":["read:pages",...],"match":"START","deny":false,"path":"","locales":[]}]' WHERE id = 2;
```

## 页面未发布 = 403

通过 SQL 创建的页面默认 `isPublished` 可能为 `false`。匿名用户访问未发布页面返回 403。

```sql
-- 批量发布
UPDATE pages SET "isPublished" = true WHERE path LIKE 'home/tutorials/%';
```
