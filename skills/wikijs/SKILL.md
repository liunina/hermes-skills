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

> **端口冲突：** 容器内部端口是 3000，宿主机映射用独立端口（示例 3010）。映射到已被占用的端口（如 3000 被其他服务占用）会导致容器启动失败。映射前用 `ss -tlnp | grep <port>` 确认端口空闲。

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

Wiki.js v2 的 `pages` 表使用自增 ID，`pageTree` 表管理层级关系。有两条路径：

- **推荐：GraphQL API**（create / update / delete）。当前已有可用的 Admin 组 API Key，无需直写数据库。完整实战指南（Shell 文件方式、Python 封装函数、参数表、错误码速查、陷阱清单）见 `references/graphql-mutations.md`。
- **回退：SQL 直写**（无可用 API Key，或需要批量 bootstrap 目录结构时）。`pages` / `pageTree` 表结构、新建页面必填字段清单、批量创建流程、`render` / 换行符 / SQL 执行等致命陷阱，全部见 `references/sql-page-management.md`。批量初始化 28 页目录结构用 `references/pages-bootstrap.sql`。

## API Key

- **创建**：唯一可靠方式是 Wiki.js 管理后台 UI（Administration → API Access → 新建），选 **Administrators** 组以获得完整读写权限。**不要自签 JWT** —— 即使用 Wiki.js 私钥正确签发 RS256 JWT，运行时仍可能拒绝验证并降级为 Guest；原理见 `references/jwt-internals.md`。
- **当前可用 Key**：Admin 组（your-api-key-name，id=<你的key_id>），具备完整写权限，可直接用于 GraphQL mutation。
- **恢复已吊销的 Key**：
  ```sql
  UPDATE "apiKeys" SET "isRevoked" = false WHERE id = <你的key_id>;
  ```
  然后 `docker restart wikijs`（启动时 `reloadApiKeys()` 重新加载有效 key 列表）。
- **JWT shell 转义**：API Key 是 JWT，含 `.` `-` `_` 等特殊字符，shell 中直接嵌入 `Bearer <jwt>` 易因引号不匹配报错。**优先用 Python subprocess（list 传参）**，示例见 `references/graphql-mutations.md`。

**@auth 权限速查：**
| 操作 | 需要（OR） |
|------|-----------|
| `create` / `update` | `write:pages` 或 `manage:pages` 或 `manage:system` |
| `delete` | `delete:pages` 或 `manage:system` |
| `flushCache` / `rebuildTree` | 仅 `manage:system` |
| `list` / `search` | `read:pages` 或 `manage:system` |

**权限排障**：mutation 返回 Forbidden 但组权限看着正常时，根因通常是 Wiki.js 的**双层判定**（`permissions` 粗粒度能力 + `pageRules` 路径级规则），常见于 Manager 组，且错误码会误导（实为缺 write 却返回 `6010 PageDeleteForbidden`）。先用 `pages.list` 探针分流「token 静默降级为 Guest」vs「pageRules 缺写权限」，完整诊断/修复见 `references/page-rules.md`；API Key 内部机制见 `references/api-key-internals.md`。

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

## 空白页 / 渲染故障排查

浏览器白屏、显示原始 Markdown、或报 Prism.js / `$json is not defined` 错误时，**按顺序**排查：

1. **先做**：`references/blank-page-diagnosis.md` —— 空白页完整 6 步流程（nginx 端口验证 → SSR 输出分类 → 数据库检查 → 清缓存重建 → theme0.js 补丁 → nginx 禁缓存 → 重建容器）。
2. **补丁细节**：`references/prism-blank-page-patch.md` —— Prism.js / TOC 白屏补丁明细（只修 `highlightAllUnder` + `tocDecoded`，**不要**碰 `registerButton`；**不要**改 navPref 默认值为 `"browse"`）。
3. **内容类白屏**（`{{ }}` / `$变量` 触发 Vue 模板注入、`render` 字段错误、字面量换行符）：见 `references/vue-template-injection.md`、`references/content-repair.md`、`references/sql-page-management.md`。

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

- `references/sql-page-management.md` — **SQL 直写建页与内容修复**：`pages` / `pageTree` 表结构、新建页面必填字段清单、批量创建流程、`render` / 换行符 / SQL 执行陷阱。GraphQL API 不可用或批量 bootstrap 时的回退路径。
- `references/pages-bootstrap.sql` — 完整 28 页目录结构的批量插入 SQL。
  运行：`docker exec -i your-postgres-container psql -U wikijs -d wikijs < references/pages-bootstrap.sql`
- `references/api-key-internals.md` — API Key 内部机制：`createNewKey()` 函数、auth.js 权限解析路径、Docker 容器调试陷阱、wk_api_ 旧格式说明。
- `references/jwt-internals.md` — JWT 签发机制、密钥存储、自签陷阱（API Key 权限调试必读）。
- `references/graphql-mutations.md` — **GraphQL Mutations 生产级完整指南**（create / update / delete）。含 Shell 文件方式调用、Python 封装函数、参数表、错误码速查、5 大陷阱、API Key 认证流程源码分析。经 2026-07 实战验证全链路打通。
- `references/error-codes.md` — **GraphQL 错误码完整参考**（1xxx~8xxx，60 个错误码）。含常见 API Key 场景速查表。
- `references/page-rules.md` — **权限双层判定模型（permissions vs pageRules）**：诊断 SQL、修复方案、误导性错误码（6010 PageDeleteForbidden 实为 write 缺失）对照表。配合 graphql-mutations.md 使用。
- `references/content-repair.md` — 安全更新页面内容 + SSR 故障快速分类。屏蔽 SQL 换行符陷阱。
- `references/prism-blank-page-patch.md` — Wiki.js v2.5.314 Prism.js 白屏 bug 补丁明细（含「不要改 navPref」陷阱）。
- `references/content-import-pitfalls.md` — **内容批量导入陷阱大全**：psql 格式化污染、Vue 模板表达式冲突、render 渲染管线、pageRules 空数组。
- `references/vue-template-injection.md` — **Vue 模板注入陷阱：`{{ }}` 和 `$variable` 导致白屏的根因与修复**。
- `references/blank-page-diagnosis.md` — **空白页完整排查流程（6 步，按顺序执行）**。含 nginx 端口验证、SSR 分类、DB 检查、缓存清理、补丁部署、nginx cache-busting、容器重建。
- `references/wiki-access-control.md` — **Wiki.js 公开/私有模式切换**。Guests 组权限管理、pageRules 路径级规则、单页面开放匿名访问。
- `references/nginx-static-assets.md` — **Nginx 静态资源托管**。sites-available vs sites-enabled 陷阱、alias 配置模式、中文文件名符号链接处理。
- `references/tutorial-import-workflow.md` — **批量教程导入流程**。从 GitHub 仓库批量导入 Markdown 内容、静态资源托管、SQL 批量生成与执行的完整工作流。
