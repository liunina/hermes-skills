# Wiki.js GraphQL API — 页面查询

Wiki.js v2 通过 `/graphql` 端点暴露 GraphQL API。认证使用 API Key（在管理后台创建）。

## 认证

```
Authorization: Bearer <api_key>
Content-Type: application/json
```

## 查询所有页面（列表）

```graphql
query {
  pages {
    list {
      id
      path
      title
      locale
      createdAt
      updatedAt
    }
  }
}
```

curl 示例：

```bash
curl -s -X POST https://your-wiki-domain.com/graphql \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ pages { list { id path title locale } } }"}'
```

## 构建目录树

获取全量页面列表后，通过 `path` 字段（如 `home/ops/docker`）按 `/` 分割即可构建树状结构。

Python 示例如 `scripts/wiki-tree.py`。

## 单页面查询

```graphql
query {
  pages {
    single(id: 1) {
      id
      path
      title
      content
      render
      locale
      createdAt
    }
  }
}
```

## 搜索页面

```graphql
query {
  pages {
    search(query: "关键词") {
      id
      path
      title
    }
  }
}
```

## 查询所有用户组

```graphql
query {
  groups {
    list {
      id
      name
    }
  }
}
```

用于诊断 API Key 权限：不用直连 DB 就能查看组 ID 映射。

## 搜索用户

```graphql
query {
  users {
    search(query: "john") {
      id
      name
      email
    }
  }
}
```

## 错误码参考

完整 60 错误码（1xxx~8xxx）速查表见 `references/error-codes.md`。

## 陷阱

- **API Key 权限**：需在 Wiki.js 管理后台创建并关联用户组才有读写权限。数据库直插的 API Key 无权限（返回 Forbidden）。
- **Administrators 组默认无页面权限**：即使 API Key 绑定到 Administrators 组（grp=1），组默认只有 `["manage:system"]`，缺少 `read:pages`、`write:pages`、`manage:pages`。创建 API Key 时需选择有完整页面权限的组，或手动给组加权限：
  ```sql
  UPDATE groups SET permissions = '["manage:system","write:pages","read:pages","manage:pages"]' WHERE id = 1;
  ```
- **Mutation 字段级权限**：同一 `update` mutation 对不同字段检查不同权限——改 `description` 要 `manage:pages`，改 `content` 要 `write:pages`。可能出现"能改描述不能改内容"的情况。
- **JWT 转义**：API Key 是 JWT 格式含特殊字符，shell 中直接嵌入易出错。可靠做法：`echo '<key>' > /tmp/key.txt` 然后用 `$(cat /tmp/key.txt)` 传入。
- **POST 请求**：所有 GraphQL 查询使用 POST，query 放在 JSON body 中。
- **分页**：`list` 默认返回所有页面，大量页面时用 `list(orderBy: "title", limit: 50, offset: 0)`。
