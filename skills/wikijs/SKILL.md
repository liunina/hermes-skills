---
name: wikijs
description: Deploy and manage Wiki.js v2 — Docker deployment with PostgreSQL, nginx reverse proxy, locale configuration, and programmatic page structure management via PostgreSQL.
version: 1.0.0
author: liunina
category: devops
platforms: [linux]
metadata:
  hermes:
    tags: [wikijs, docker, postgres, nginx, graphql, devops]
    category: devops
---

# Wiki.js v2 — 部署与管理

## 触发条件
- 安装、部署、配置 Wiki.js
- 修改语言/locale 设置
- 通过脚本批量创建页面/目录结构
- Wiki.js 报错排查（页面 404、Error、locale 同步失败）

## 部署

参照 `self-hosted-deployment` 技能的标准流程。Wiki.js 的 docker-compose 示例：

```yaml
services:
  wikijs:
    image: requarks/wiki:2
    container_name: wikijs
    restart: unless-stopped
    ports:
      - "127.0.0.1:3010:3000"
    environment:
      DB_TYPE: postgres
      DB_HOST: your-postgres-container      # 共用现有 PostgreSQL
      DB_PORT: 5432
      DB_NAME: wikijs
      DB_USER: wikijs
      DB_PASS: <password>
    networks:
      - n8n_n8n_network
    volumes:
      - wikijs_data:/wiki/data/content

volumes:
  wikijs_data:

networks:
  n8n_n8n_network:
    external: true
```

nginx 反代配置参照 `self-hosted-deployment`，注意 WebSocket 支持（Wiki.js 需要 `Upgrade` / `Connection` 头）。

## 语言 / Locale 配置

### 切换语言
1. 修改 PostgreSQL `settings` 表：
   ```sql
   UPDATE settings SET value = '{"code":"zh","autoUpdate":true,"namespacing":false,"namespaces":[]}'
   WHERE key = 'lang';
   ```

2. **关键陷阱**：只改 `settings.lang` 不够！Wiki.js 启动时从 `locales` 表读取已有语言包，再从 Graph 端点拉取翻译。如果 `locales` 表缺少目标语言行，会报：
   ```
   Syncing locales with Graph endpoint: [ FAILED ]
   No such locale in local store.
   ```

3. **修复**：先插入占位行，再重启让 Wiki.js 自动下载：
   ```sql
   INSERT INTO locales (code, strings, "isRTL", name, "nativeName", availability, "createdAt", "updatedAt")
   VALUES ('zh', '{}', false, 'Chinese Simplified', '简体中文', 0, NOW()::text, NOW()::text)
   ON CONFLICT (code) DO NOTHING;
   ```
   然后 `docker restart wikijs`。日志应显示：
   ```
   Pulled latest locale updates for Chinese Simplified from Graph endpoint: [ COMPLETED ]
   Syncing locales with Graph endpoint: [ COMPLETED ]
   ```

### 验证
```sql
SELECT code, name, "nativeName", availability FROM locales;
-- availability 应为 100 表示完整
```

## 程序化创建页面

Wiki.js v2 的 `pages` 表使用自增 ID（序列 `pages_id_seq`），`pageTree` 表管理层级关系。

### 重要：API Key vs 数据库直写

> **已更新**：完整的 API Key 管理（创建、恢复、权限诊断、Mutation 示例）见上方「API Key 管理」章节和 `references/graphql-mutations.md`。

API Key 需通过 UI 创建并关联用户组才有写权限。数据库直插的 API Key 无权限（返回 Forbidden）。**当前已有可用 Admin 组 API Key（your-api-key-name，id=<你的key_id>），可直接通过 GraphQL API 创建/更新/删除页面，无需直写数据库。** 详见 `references/graphql-mutations.md`。

**API Key 权限模型：** API Key 的权限继承自其绑定的用户组（JWT 中 `grp` 字段）。当前 Administrators 组（grp=1）已配备完整权限 `["manage:system","write:pages","read:pages","manage:pages"]`。Admin 组 `pageRules: []`（空数组）= 无路径限制，所有操作放行。Manager 组（grp=4）`pageRules` 也已补全写权限。

**需要的权限：**
| 权限 | 作用 |
|------|------|
| `read:pages` | 读取页面内容和元数据 |
| `write:pages` | 写入/更新页面内容 |
| `manage:pages` | 管理页面（创建、删除、移动、修改描述等） |
| `manage:system` | 管理系统设置（Administrators 默认已有） |

**诊断当前权限：**
```sql
SELECT id, name, permissions FROM groups;
-- Administrators 默认: ["manage:system"] ← 缺少 write:pages！
```

**修复 — 给组添加权限：**
```sql
UPDATE groups SET permissions = '["manage:system","write:pages","read:pages","manage:pages"]' WHERE id = 1;
-- 重启 wikijs 后生效: docker restart wikijs
```

**Mutation 权限细粒度检查：** Wiki.js 对同一个 `update` mutation 的不同字段检查不同权限：
- 只更新 `description` → 检查 `manage:pages`（已通过）
- 更新 `content` → 检查 `write:pages`（单独校验！）
- 所以可能出现"能改 description 但不能改 content"的情况，根因是组权限不完整。

**自签 JWT 陷阱：** 不要尝试手动签发 API Key JWT！即使你用 Wiki.js 的私钥（`settings` 表中 `certs.private`）和 `sessionSecret` 正确签发了 RS256 JWT，且 Python 端验证通过，Wiki.js 运行时仍可能拒绝验证。原因可能是 Node.js `jsonwebtoken` 库与 Python `pyjwt` 的密钥格式/填充处理有细微差异。**唯一可靠的方式：通过 Wiki.js 管理后台 UI 创建 API Key。** 内部密钥存储细节见 `references/jwt-internals.md`。

**JWT Shell 转义陷阱：** API Key 是 JWT 格式，含 `.` `-` `_` 等特殊字符。在 shell 中直接嵌入 `Bearer <jwt>` 容易因引号不匹配导致语法错误。**强烈推荐使用 Python subprocess（list 传参）**，彻底避免 shell 转义：

```python
import subprocess
auth = "Bearer " + key  # key 从文件读取，不含换行符
r = subprocess.run(
    ['curl', '-s', 'https://your-wiki-domain.com/graphql', '-X', 'POST',
     '-H', auth, '-H', 'Content-Type: application/json',
     '-d', body],
    capture_output=True, text=True)
```

如果必须用 shell，可靠做法是将 key 写入临时文件：
```bash
echo '<jwt>' > /tmp/wiki_api_key.txt
curl ... -H "Authorization: Bearer $(cat /tmp/wiki_api_key.txt)" ...
```
但 heredoc 和反斜杠转义仍容易出错，Python subprocess 是首选。

### pages 表结构（关键字段）

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

### 致命陷阱：新建页面必填字段清单

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

### 致命陷阱：publishEndDate / publishStartDate

这两个字段必须是字符串（VARCHAR），**NULL 会导致页面报错**：
> "Expected a string at publishEndDate, got null"

插入时始终设为空字符串 `''`：
```sql
INSERT INTO pages (..., "publishEndDate", "publishStartDate", ...)
VALUES (..., '', '', ...);
```

### pageTree 表结构

| 字段 | 说明 |
|------|------|
| id | 手动分配（无自增） |
| path | 与 pages.path 一致 |
| depth | 路径中 `/` 的数量 |
| parent | **引用 pageTree.id**（不是 pages.id！） |
| pageId | 引用 pages.id |
| ancestors | JSON 数组，所有祖先 pageId |
| isFolder | 有子页面则为 true |

### 致命陷阱：localeCode 为空 → 页面不显示在目录树

通过 SQL INSERT 创建页面时，必须设置 `"localeCode" = 'zh'`（或其他有效 locale）。

**如果留空或 NULL，Wiki.js 重启重建 pageTree 时不会为该页面创建条目**，导致 GraphQL `tree` 查询返回只有 home，页面在侧边栏不显示。

```sql
-- ❌ 错误：localeCode 留空
INSERT INTO pages (...) VALUES (..., '', ...);

-- ✅ 正确
INSERT INTO pages (..., "localeCode", ...) VALUES (..., 'zh', ...);
```

### 批量创建页面流程

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

### 批量修复 NULL 日期字段
```sql
UPDATE pages SET "publishStartDate" = '', "publishEndDate" = ''
WHERE "publishEndDate" IS NULL;
```

### UPDATE 现有页面内容

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

如果 API Key 有 `write:pages` 权限，也可用 GraphQL mutation：
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

### 启动后首页为空

用 `references/pages-bootstrap.sql` 批量创建页面后，首页 (`id=1, path=home`) 的 `content` 只有占位文字：
```
# 首页

跨境电商技术运维知识库
```
需要手动填充首页内容（目录索引 + 各分类链接），参考上方的 UPDATE 示例。

### 内容换行符陷阱（SQL UPDATE 专用）

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

## 空白页故障分类（SSR 输出判断）

根据 `curl https://your-wiki-domain.com/` 的 SSR 输出来定位问题层级：

| SSR 输出特征 | 问题层级 | 根因 | 修复 |
|------------|---------|------|------|
| `<div id="root">` 空（无任何内容，非 `<!---->`） | SSR 代理层 | nginx `proxy_pass` 端口与 Docker 映射不匹配 | 验证 `docker ps` 端口 + nginx config 一致（见下方 nginx 端口验证） |
| `<page>` 组件存在，内容正常但浏览器白屏 + Console 报 `ReferenceError: $json is not defined` | 客户端 Vue 模板 | 内容中 `{{ }}` 或 `$变量` 被 Vue 当成模板表达式 | `{{ → { {`（加空格）、`$ → \$` 转义 |
| `<div id="root"><!----></div>` 完全空 | SSR 渲染器 | content 中换行符是字面量 `\n` | SQL 用 `$$` 重写 content |
| "Page has no rendered version" | SSR 渲染器 | `render` 字段为 NULL | 设 `render = content` |
| "Error \| Wiki" + app-error | SSR 渲染器 | `render` 是预渲染 HTML | 设 `render = content`（Markdown） |
| HTML 源码有 `<page>` 但浏览器白屏 | 客户端 JS + 缓存 | 浏览器缓存了旧 JS | nginx cache 头 + 清理缓存 |
| HTML 源码有 `<page>` 但浏览器显示原始 Markdown（`#` `##` `-` 等标记可见） | 客户端 JS | Vue app 崩溃，Markdown 渲染器未执行 | 检查 theme0.js 补丁是否正确；**常见根因：navPref \"browse\" 补丁导致侧栏 mounted 时 GraphQL 崩溃整个 Vue app**（见下方陷阱） |

## ⚠️ 致命陷阱：不要改 navPref 默认值为 \"browse\"

**症状：** 页面显示原始 Markdown 源码（`#`、`##`、`- [链接]` 等标记全部可见），所有内容挤在一行。SSR 源码正常（`<page>` 组件存在），但客户端 Vue app 完全未运行。

**根因：** 修改 theme0.js 的 `getItem("navPref")||"custom"` 为 `||"browse"` 后，侧栏组件的 `mounted()` 钩子立即调用 `loadFromCurrentPath()`，该方法发起 GraphQL 查询。如果查询失败或抛出未捕获异常，整个 Vue 组件树崩溃，Markdown 渲染器不会执行，`<div>` 中的原始 Markdown 直接暴露在页面上。错误为静默崩溃 — 浏览器 Console 可能无明显报错。

**结论：** 不要在 theme0.js 中修改 navPref 默认值。如需默认显示目录树，应在 Wiki.js 管理后台将导航模式设为「Tree」而非「MIXED」。

## nginx 端口验证（空白页排查第一步）

**在排查任何 SSR/JS 问题前，先确认 nginx `proxy_pass` 端口与 Docker 端口映射一致。** 端口不匹配是最常见的「突然空白」根因。

```bash
# 1. 查 Wiki.js 实际监听端口
docker ps --filter name=wikijs --format '{{.Ports}}'
# 输出示例: 127.0.0.1:3010->3000/tcp  → 宿主机端口是 3010

# 2. 查 nginx proxy_pass
grep proxy_pass /etc/nginx/sites-available/your-wiki-domain.com
# 必须与第 1 步的宿主机端口一致！

# 3. 直接测试本地端口
curl -s http://127.0.0.1:3010/ | grep '<title>'
# 能返回标题 → Wiki.js 正常；不能 → 端口错误或容器未启动
```

**常见陷阱：** Docker 重建后端口映射改变、多项目共用服务器时端口记混、nginx 配置残留旧端口号。

## 端口冲突（重建容器时）

Wiki.js docker-compose 内部端口是 3000，宿主机映射应为独立端口。如果映射到已被占用的端口（如 3000 被 Dify nghttpx 占用），容器启动失败。始终用 `ss -tlnp | grep <port>` 确认端口空闲再映射。

## API Key 管理

### 创建与恢复

- **创建**：唯一可靠方式是通过 Wiki.js 管理后台 UI（Administration → API Access → 新建）。选择 Administrators 组以获得完整读写权限。
- **恢复已吊销的 Key**：数据库中将 `isRevoked` 设为 false 后重启即可：
  ```sql
  UPDATE "apiKeys" SET "isRevoked" = false WHERE id = <你的key_id>;
  ```
  `docker restart wikijs` — `reloadApiKeys()` 会在启动时重新加载有效 key 列表。
- **查看所有 Key 状态**：
  ```sql
  SELECT id, name, "isRevoked", expiration FROM "apiKeys";
  ```
- **查看 Key 绑定的组**（解码 JWT payload）：
  ```python
  import base64, json
  payload = key.split('.')[1] + '=' * (4 - len(key.split('.')[1]) % 4)
  data = json.loads(base64.urlsafe_b64decode(payload))
  print(f"group={data['grp']}, api_id={data['api']}")
  ```

### Manager 组权限陷阱：两个独立原因（先分流再修）

Manager 组（grp=4）数据库 `permissions` 字段明确有 `write:pages` 和 `manage:pages`，但 API Key mutation 可能返回 Forbidden。**有两个完全独立的根因，必须先用 `pages.list` 探针分流：**

**探针：** 用该 API Key 调 `{ pages { list { id path title } } }`
- ✅ 能返回列表 → token 验证通过 → 走「原因 B：pageRules 缺写权限」
- ❌ 返回 Forbidden 或空 → token 被静默降级为 Guest → 走「原因 A」

**原因 A — 静默降级为 Guest：** API Key 被 passport-jwt 拒绝验证，降级为 Guest（仅 `read:pages`、`read:assets`、`read:comments`），所有 mutation 返回 Forbidden。详见 `references/graphql-mutations.md`。

**原因 B — pageRules 字段没配齐写权限：** Wiki.js 权限是 `permissions`（粗粒度能力清单）+ `pageRules`（路径级具体生效规则）**双层判定**，两层都要包含目标角色。Manager 组默认 pageRules 只有 `["read:pages","read:assets","read:comments","write:comments"]`，缺 `write:pages` / `manage:pages`，所以 create/update 被拒。**错误码会误导**：创建文档时实际返回 `PageDeleteForbidden 6010`，不是 write 相关的错误码。完整诊断 SQL、修复方案、错误码对照见 `references/page-rules.md`。

**首选解决：** 重新签发 API Key 并绑定 Administrators 组（grp=1）。Administrators 默认 pageRules 完整，两个原因都规避。次选：按 `references/page-rules.md` 方案 B 给当前组补 pageRules。

### GraphQL Mutation @auth 要求

所有 mutation 的 @auth 检查和完整示例见 `references/graphql-mutations.md`。

关键要求速查：
| 操作 | 需要（OR） |
|------|-----------|
| `create` / `update` | `write:pages` 或 `manage:pages` 或 `manage:system` |
| `delete` | `delete:pages` 或 `manage:system` |
| `flushCache` / `rebuildTree` | 仅 `manage:system` |
| `list` / `search` | `read:pages` 或 `manage:system` |

## 常用诊断

```sql
-- 查看所有页面
SELECT id, path, title, "localeCode" FROM pages ORDER BY path;

-- 查看页面树
SELECT id, path, depth, "isFolder", parent, "pageId" FROM "pageTree" ORDER BY id;

-- 查看语言包状态
SELECT code, name, availability FROM locales;

-- 查看导航配置
SELECT * FROM navigation;
```

## 验证页面

```bash
# 首页
curl -sL https://your-wiki-domain.com/ | grep '<title>'

# 指定 locale 页面
curl -s https://your-wiki-domain.com/zh/home | grep '<title>'

# GraphQL API（需有效 API Key）
curl -s -X POST https://your-wiki-domain.com/graphql \
  -H "Authorization: Bearer <key>" \
  -d '{"query":"{pages{list{id path title}}"}'
```

## 空白页 / 客户端渲染故障排查

**症状：** 浏览器打开页面完全空白，SSR 输出正常（源码有内容），控制台报 Prism.js 错误：
```
TypeError: Cannot read properties of undefined (reading 'querySelectorAll')
Prism.plugins.toolbar.registerButton: "copy-to-clipboard" registered already
TypeError: Cannot read properties of null (reading 'length') at theme0.js
```

**原因：** Wiki.js 主题的 Prism.js 代码高亮插件重复初始化导致 Vue 组件挂载失败。这是 Wiki.js v2.5.314 的已知 bug，不是内容问题。

**修复流程 — 两步走（先清缓存，如果仍白屏再打补丁）：**

### Step 1: 清缓存 + 重启（首选，大部分情况有效）
```bash
docker exec wikijs rm -rf /wiki/data/cache/*
docker exec your-postgres-container psql -U wikijs -d wikijs -c "DELETE FROM \"pageTree\";"
docker restart wikijs
```

### Step 2: 如果仍白屏 — 直接修补丁到 theme0.js

清缓存无效说明是 Prism.js / TOC 在 Vue 组件挂载时就崩溃了。需要修补编译后的主题文件。补丁明细见 `references/prism-blank-page-patch.md`。

**⚠️ 仅修复 Bug #1（highlightAllUnder）和 Bug #3（tocDecoded）。Bug #2（registerButton）不可修复：** 代码中 `registerButton` 是 `h.a.plugins.toolbar.registerButton(...)` 的子串，`try{` 会插入到错误位置；且 `try` 是 statement 不能在 webpack chunk 逗号表达式位置使用。详情见 `references/prism-blank-page-patch.md`。

快速命令（3 处修复：Prism + TOC + 侧栏默认目录树）：

```bash
# 复制主题到宿主机
docker cp wikijs:/wiki/assets/js/theme0.js /tmp/theme0.js
cp /tmp/theme0.js /tmp/theme0.js.bak

# 两处修复（Python 一键执行；⚠️ 不要加 navPref 补丁，见下方陷阱）
python3 << 'PYEOF'
with open('/tmp/theme0.js') as f: c = f.read()
c = c.replace('h.a.highlightAllUnder(this.$refs.container)', 'this.$refs.container&&h.a.highlightAllUnder(this.$refs.container)')
c = c.replace('e.tocDecoded.length', '(e.tocDecoded||[]).length')
with open('/tmp/theme0.js','w') as f: f.write(c)
print('Patched:', len(c), 'bytes')
PYEOF

# 部署 + 重启
docker cp /tmp/theme0.js wikijs:/wiki/assets/js/theme0.js
docker restart wikijs
```

**验证：** 检查 SSR 输出不含 "app-error" 或 "Oops"：
```bash
curl -s https://your-wiki-domain.com/ | grep -c "Error\|app-error\|Oops"
# 应输出 0
```

### Step 3: 浏览器缓存强制刷新

补丁部署后，浏览器**可能仍加载旧的缓存 JS**，因为 Wiki.js 的 JS 文件使用静态 build ID 作为 query string（如 `?1777631845`），不会随手动文件修改而更新。即使 `docker restart wikijs` 也不改变这个 ID。

**修复：** 先尝试暴力刷新浏览器（**Ctrl+Shift+Delete** 清除缓存后重新加载）。如无效，在 nginx 配置中为 `/_assets/` 路径添加 `Cache-Control: no-store` 头，强制浏览器每次重新请求所有 JS/CSS：

```nginx
# 在 your-wiki-domain.com server 块中，location /wiki-save 之后、location / 之前插入：
location /_assets/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "no-store, must-revalidate" always;
}
```

然后 `nginx -t && nginx -s reload`。验证：`curl -sI https://your-wiki-domain.com/_assets/js/app.js | grep -i cache` 应返回 `no-store`。

最终手段：重建 Wiki.js 容器（`docker compose down && docker compose up -d`），这会生成全新的 build ID，必然打破所有缓存。

> **⚠️ 重建陷阱：** 容器重建后 theme0.js 恢复为未修补的原始版本，**必须重新打补丁**！补丁已保留在 `/tmp/theme0.js`（上次修补的版本），直接 `docker cp` 回容器即可：
> ```bash
> cd /opt/workspace/wikijs && docker compose down   # 停止并删除容器
> # 注意：docker compose up -d 可能被识别为服务进程，需用 background=true
> cd /opt/workspace/wikijs && docker compose up -d   # 重建并启动
> sleep 12  # 等待启动
> docker cp /tmp/theme0.js wikijs:/wiki/assets/js/theme0.js  # 重新打补丁
> docker restart wikijs  # 生效
> ```
>
> 重建后验证：`curl -s https://your-wiki-domain.com/ | grep -c "Error\|app-error\|Oops"` 应输出 0。

## GraphQL API 页面查询

查看目录结构、搜索页面、获取单页内容，通过 GraphQL API 而非直连数据库。

```bash
# 列出所有页面
curl -s -X POST https://your-wiki-domain.com/graphql \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ pages { list { id path title locale } } }"}'
```

完整 API 参考和目录树构建脚本见：
- `references/graphql-api.md` — 完整 GraphQL API 文档（list / single / search）
- `scripts/wiki-tree.py` — 一键生成目录树：`WIKIJS_API_KEY=xxx python3 scripts/wiki-tree.py`

## 参考文件

- `references/pages-bootstrap.sql` — 完整 28 页目录结构的批量插入 SQL。
  运行：`docker exec -i your-postgres-container psql -U wikijs -d wikijs < references/pages-bootstrap.sql`
- `references/api-key-internals.md` — API Key 内部机制：`createNewKey()` 函数、auth.js 权限解析路径、Docker 容器调试陷阱、wk_api_ 旧格式说明。
- `references/jwt-internals.md` — JWT 签发机制、密钥存储、自签陷阱（API Key 权限调试必读）。
- `references/graphql-mutations.md` — **GraphQL Mutations 生产级完整指南**（create / update / delete）。含 Shell 文件方式调用、Python 封装函数、参数表、错误码速查、5 大陷阱、API Key 认证流程源码分析。经 2026-07 实战验证全链路打通。
- `references/error-codes.md` — **GraphQL 错误码完整参考**（1xxx~8xxx，60 个错误码）。含常见 API Key 场景速查表。
- `references/page-rules.md` — **权限双层判定模型（permissions vs pageRules）**：诊断 SQL、修复方案、误导性错误码（6010 PageDeleteForbidden 实为 write 缺失）对照表。配合 graphql-mutations.md 使用。
- `references/content-repair.md` — 安全更新页面内容 + SSR 故障快速分类。屏蔽 SQL 换行符陷阱。
- `references/prism-blank-page-patch.md` — Wiki.js v2.5.314 Prism.js 白屏 bug 补丁明细。
- `references/content-import-pitfalls.md` — **内容批量导入陷阱大全**：psql 格式化污染、Vue 模板表达式冲突、render 渲染管线、pageRules 空数组。
- `references/vue-template-injection.md` — **Vue 模板注入陷阱：`{{ }}` 和 `$variable` 导致白屏的根因与修复**。
- `references/blank-page-diagnosis.md` — **空白页完整排查流程（6 步，按顺序执行）**。含 nginx 端口验证、SSR 分类、DB 检查、缓存清理、补丁部署、nginx cache-busting、容器重建。
- `references/wiki-access-control.md` — **Wiki.js 公开/私有模式切换**。Guests 组权限管理、pageRules 路径级规则、单页面开放匿名访问。
- `references/nginx-static-assets.md` — **Nginx 静态资源托管**。sites-available vs sites-enabled 陷阱、alias 配置模式、中文文件名符号链接处理。
- `references/tutorial-import-workflow.md` — **批量教程导入流程**。从 GitHub 仓库批量导入 Markdown 内容、静态资源托管、SQL 批量生成与执行的完整工作流。
