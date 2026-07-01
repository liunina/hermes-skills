# Wiki.js GraphQL Mutations — 创建/更新/删除文档

## 🔑 API Key 配置

在 Wiki.js 管理后台 → API Access 创建 API Key，选择 **Administrators** 组。创建后可通过以下方式获取 Key：

**Key 位置：** 数据库 `apiKeys` 表 id=<你的key_id>。读取方式：
```bash
docker exec your-postgres-container psql -U wikijs -d wikijs -t -A \
  -c "SELECT key FROM \"apiKeys\" WHERE id = <你的key_id>;" > /tmp/wiki_key.txt
```

## 创建文档 — 完整实战指南

### 先决条件检查清单

- [x] API Key 存在且未吊销
- [x] API Key 绑定到 Administrators 组（grp=1）— 有 `manage:system` 覆盖所有权限
- [x] 组 `permissions` 包含 `manage:system`（Admin 组默认有）
- [ ] **不需要** pageRules（Admin 组 `pageRules: []` 表示无限制，所有操作放行）

### Shell 调用（推荐：文件方式避免转义地狱）

**⚠️ 致命陷阱：** Shell 中直接嵌入 GraphQL query 会因 `\n`、`"`、`$` 等字符的转义层级问题导致 JSON 解析失败或静默写入错误内容。**始终用文件方式。**

对于生产脚本，优先使用 **GraphQL variables**（见下方 Python `create_page` 示例 —— 把内容作为 JSON 值传输，彻底规避转义）；如果坚持字符串拼接，至少用 `json.dumps(..., ensure_ascii=False)` 生成安全的字符串字面量。

```bash
# 1. 取出 key
docker exec your-postgres-container psql -U wikijs -d wikijs -t -A \
  -c "SELECT key FROM \"apiKeys\" WHERE id = <你的key_id>;" > /tmp/wiki_key.txt
KEY=$(cat /tmp/wiki_key.txt)

# 2. 把 query 写入文件
cat > /tmp/create_page.json << 'JSONEOF'
{
  "query": "mutation { pages { create(content: \"# 标题\\n\\n内容段落\", title: \"页面标题\", description: \"描述\", path: \"home/test-page\", editor: \"markdown\", locale: \"zh\", isPublished: true, isPrivate: false, tags: []) { responseResult { succeeded message errorCode slug } page { id path } } } }"
}
JSONEOF

# 3. 调用
curl -s -X POST https://your-wiki-domain.com/graphql \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/create_page.json | python3 -m json.tool
```

### Python 调用（推荐用于批量/n8n 工作流）

```python
import subprocess, json

def wiki_api_key():
    """从数据库获取 API Key"""
    r = subprocess.run(
        ['docker', 'exec', 'your-postgres-container', 'psql', '-U', 'wikijs', '-d', 'wikijs',
         '-t', '-A', '-c', 'SELECT key FROM "apiKeys" WHERE id = <你的key_id>;'],
        capture_output=True, text=True)
    return r.stdout.strip()

def create_page(title, content, path, description="", tags=None):
    """通过 GraphQL API 创建 Wiki.js 页面（使用 GraphQL variables，最稳妥）"""
    if tags is None:
        tags = []

    # 用 GraphQL variables 传参：content/title/description/path 等作为 JSON 值发送，
    # 内容里的引号、反斜杠、换行、$、{{ }} 由 JSON 序列化处理，绝不会破坏 query
    # 结构，无需任何手动转义。这是官方推荐、也是最稳妥的方式。
    query = """
mutation CreatePage(
  $content: String!, $title: String!, $description: String!, $path: String!,
  $editor: String!, $locale: String!,
  $isPublished: Boolean!, $isPrivate: Boolean!, $tags: [String]!
) {
  pages {
    create(
      content: $content, title: $title, description: $description, path: $path,
      editor: $editor, locale: $locale,
      isPublished: $isPublished, isPrivate: $isPrivate, tags: $tags
    ) {
      responseResult { succeeded message errorCode slug }
      page { id path }
    }
  }
}
"""
    variables = {
        "content": content,
        "title": title,
        "description": description,
        "path": path,
        "editor": "markdown",
        "locale": "zh",
        "isPublished": True,
        "isPrivate": False,
        "tags": tags,
    }

    key = wiki_api_key()
    r = subprocess.run(
        ['curl', '-s', 'https://your-wiki-domain.com/graphql',
         '-X', 'POST',
         '-H', f'Authorization: Bearer {key}',
         '-H', 'Content-Type: application/json',
         '-d', json.dumps({"query": query, "variables": variables})],
        capture_output=True, text=True)
    
    result = json.loads(r.stdout)
    rr = result['data']['pages']['create']['responseResult']
    if not rr['succeeded']:
        raise Exception(f"创建失败 [{rr['errorCode']}] {rr['slug']}: {rr['message']}")
    
    return result['data']['pages']['create']['page']

# 使用示例（variables 方式：content 直接传真正的多行内容，无需双重转义）
page = create_page(
    title="新页面",
    content="# 标题\n\n内容...",
    path="home/ops/new-page",
    description="通过 API 创建的页面"
)
print(f"创建成功: id={page['id']}, path={page['path']}")
```

### 创建参数完整说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | String | ✅ | Markdown 内容。换行用 `\\n`（JSON 中的两个字符，GraphQL 解析为真正换行） |
| `title` | String | ✅ | 页面标题 |
| `description` | String | ✅ | 页面描述（meta description） |
| `path` | String | ✅ | 路径，如 `home/ops/docker-guide`。父目录必须已存在 |
| `editor` | String | ✅ | 固定 `"markdown"` |
| `locale` | String | ✅ | 语言代码，中文用 `"zh"` |
| `isPublished` | Boolean | ✅ | `true` 公开，`false` 草稿 |
| `isPrivate` | Boolean | ✅ | `true` 仅登录用户可见 |
| `tags` | [String] | ✅ | 标签数组，无标签传 `[]` |

### 响应解读

成功：
```json
{
  "responseResult": {
    "succeeded": true,
    "errorCode": 0,
    "slug": "ok",
    "message": "Page created successfully."
  },
  "page": { "id": 54, "path": "home/test-page" }
}
```

失败 — 路径重复（6002）：
```json
{
  "responseResult": {
    "succeeded": false,
    "errorCode": 6002,
    "slug": "PageDuplicateCreate",
    "message": "Cannot create this page because an entry already exists at the same path."
  }
}
```

失败 — 无权限（6010，也可能是 6008）：
```json
{
  "responseResult": {
    "succeeded": false,
    "errorCode": 6010,
    "slug": "PageDeleteForbidden",
    "message": "You are not authorized to delete this page."
  }
}
```

### 常见失败原因速查

| 症状 | errorCode | 根因 | 修复 |
|------|-----------|------|------|
| 路径已存在 | 6002 | `path` 重复 | 换路径或先删除旧页面 |
| Forbidden（Admin Key） | 6010/6008 | Key 被静默降级 Guest | UI 重建 API Key |
| Forbidden（Manager Key） | 6010 | `pageRules` 缺 write:pages | 换 Admin Key 或补 pageRules |
| 父目录不存在 | 6001 | path 中的父目录未创建 | 先创建父目录页面 |
| content 为空 | 6004 | content 参数为空字符串 | 至少给 `"# 标题"` |

## 更新文档

```graphql
mutation {
  pages {
    update(
      id: 54,
      content: "# 更新后\\n\\n新内容",
      title: "新标题",
      description: "新描述",
      isPublished: true
    ) {
      responseResult { succeeded message errorCode }
    }
  }
}
```

**注意：** `update` 是全量替换，未传的字段不会保留旧值（如不传 `description` 会变空）。建议先 `pages.single` 读取当前值再合并。

## 删除文档

```graphql
mutation {
  pages {
    delete(id: 54) {
      responseResult { succeeded message }
    }
  }
}
```

**⚠️ 不可逆操作。** 删除后页面进入回收站，需在 UI 中永久删除或通过 `render` 表清理。

## 读取文档（单页含内容）

```graphql
query {
  pages {
    single(id: 54) {
      id
      path
      title
      content
      render
      description
      locale
      isPublished
      isPrivate
      createdAt
      updatedAt
    }
  }
}
```

## 列出所有文档

```graphql
query {
  pages {
    list(orderBy: TITLE) {
      id
      path
      title
      locale
    }
  }
}
```

## 搜索文档

```graphql
query {
  pages {
    search(query: "docker") {
      id
      path
      title
    }
  }
}
```

## @auth 权限速查

| 操作 | 需要权限（OR） |
|------|---------------|
| `pages.list` | `manage:system` 或 `read:pages` |
| `pages.single` | `read:pages` 或 `manage:system` |
| `pages.search` | `manage:system` 或 `read:pages` |
| `pages.create` | `write:pages` 或 `manage:pages` 或 `manage:system` |
| `pages.update` | `write:pages` 或 `manage:pages` 或 `manage:system` |
| `pages.delete` | `delete:pages` 或 `manage:system` |
| `pages.flushCache` | 仅 `manage:system` |
| `pages.rebuildTree` | 仅 `manage:system` |
| `pages.move` | `manage:pages` 或 `manage:system` |

## ⚠️ 致命陷阱清单

### 1. Shell 转义地狱

Shell 中 GraphQL query 含 `\n`、`"`、`$` 等多层转义字符。永远用文件方式（`-d @file`）或 Python subprocess list 传参。

### 2. API Key 静默降级 Guest

passport-jwt 可能拒绝验证某 JWT → 降为 Guest（仅 `read:pages`）→ 所有 mutation Forbidden。唯一修复：**在 Wiki.js 管理后台 UI 重建 API Key。**

### 3. pageRules 双层判定

Manager 组 `permissions` 有 `write:pages`，但 `pageRules` 只配了读权限 → create/update 返回 `6010 PageDeleteForbidden`（错误码误导）。Admin 组 `pageRules: []` = 无限制，推荐使用。

### 4. content 中 `{{ }}` 和 `$变量` 会触发 Vue 模板注入

通过 API 写入的内容同样会被 Wiki.js 客户端 Vue 解析。包含 `{{ }}` 或 `$变量` 的内容需转义：`{{ → { {`（加空格），`$ → \$`。否则页面白屏。

### 5. 换行符：GraphQL 里是 `\\n`，不是 `\n`

JSON 中 `"\\n"` = 两个字符 `\` 和 `n`，GraphQL 解析器将其转为真正换行。如果写成 `"\n"`（JSON 中是一个真实换行符），GraphQL 解析失败。

## API Key 认证流程（源码分析）

1. passport-jwt 验证 JWT 签名 → 提取 payload（含 `api`、`grp` 字段）
2. `auth.authenticate()` 检测 `_.has(user, 'api')` → 走 API token 分支
3. 验证 `WIKI.auth.validApiKeys` 包含此 key ID（`isRevoked=false AND expiration > now`）
4. 从 group 解析权限：`_.get(WIKI.auth.groups, `${user.grp}.permissions`, [])`
5. GraphQL auth directive 检查：`_.some(user.permissions, pm => _.includes(requiredScopes, pm))`

## 恢复已吊销的 Key

```sql
UPDATE "apiKeys" SET "isRevoked" = false WHERE id = <你的key_id>;
```
然后 `docker restart wikijs`。

## 诊断三步法

按顺序测试，快速定位权限问题：
1. `pages.list` → 验证基本连通 + read 权限
2. `pages.flushCache` → 验证是否有 `manage:system`
3. `pages.create` → 验证写权限

结果矩阵：
- list ✅ + flushCache ✅ + create ✅ → Admin 组，一切正常
- list ✅ + flushCache ❌ + create ❌ → 只有 `read:pages`，无 manage 权限
- list ✅ + flushCache ❌ + create ✅ → Manager 组 pageRules 已修复
- list ❌ → Key 无效或已吊销
