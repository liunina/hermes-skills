# Wiki.js JWT / API Key 内部机制

## 密钥存储

Wiki.js 启动时自动生成 RSA 密钥对和 session secret，存储在 `settings` 表中：

```sql
-- 查看密钥存储
SELECT key, length(value::text) FROM settings WHERE key IN ('certs', 'sessionSecret');
-- certs: ~2600 字节 JSON，含 jwk / public / private
-- sessionSecret: ~72 字节 JSON，如 {"v":"54de1432..."}
```

### certs 结构
```json
{
  "jwk": {"kty": "RSA", "n": "...", "e": "AQAB"},
  "public": "-----BEGIN RSA PUBLIC KEY-----\n...\n-----END RSA PUBLIC KEY-----",
  "private": "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-256-CBC,...\n...\n-----END RSA PRIVATE KEY-----"
}
```

私钥是加密的 PEM 格式，用 `sessionSecret` 作为 passphrase。

## JWT 签发逻辑

API Key 由 `/wiki/server/models/apiKeys.js` 的 `createNewKey` 方法创建：

```js
const key = jwt.sign({
  api: entry.id,      // apiKeys 表自增 ID
  grp: fullAccess ? 1 : group   // 用户组 ID
}, {
  key: WIKI.config.certs.private,
  passphrase: WIKI.config.sessionSecret
}, {
  algorithm: 'RS256',
  expiresIn: expiration,
  audience: WIKI.config.auth.audience,  // 'urn:wiki.js'
  issuer: 'urn:wiki.js'
})
```

JWT payload 结构：
```json
{
  "api": 2,          // apiKeys.id
  "grp": 1,          // groups.id（用户组）
  "iat": 1782830989,
  "exp": 1814388589,
  "aud": "urn:wiki.js",
  "iss": "urn:wiki.js"
}
```

## API Key 认证流程

1. JWT 验证通过后，Wiki.js 从 payload 提取 `grp`，查找 `WIKI.auth.groups[grp].permissions`
2. `WIKI.auth.groups` 在启动时从数据库 `groups` 表加载：`_.keyBy(groupsArray, 'id')`
3. `validApiKeys` 列表也在启动时加载：`SELECT id FROM apiKeys WHERE isRevoked=false AND expiration > now()`
4. **修改 `groups.permissions` 后必须 `docker restart wikijs`** — 权限在内存中不动态刷新

## checkAccess 逻辑

```js
checkAccess(user, permissions = [], page = false) {
    const userPermissions = user.permissions
    // 有 manage:system 直接通过所有检查
    if (_.includes(userPermissions, 'manage:system')) return true
    // 否则检查是否拥有所需权限之一
    if (_.intersection(userPermissions, permissions).length < 1) return false
    // page 级别规则...
}
```

**关键：** `manage:system` 是万能通行证，任何 `@auth(requires: [...])` 只要列表里含 `manage:system` 就能通过。

## GraphQL @auth 指令权限要求速查

来自 `/wiki/server/graph/schemas/page.graphql`：

| 操作 | 所需权限 |
|------|----------|
| `list` / `search` / `single` (读) | `read:pages` 或 `manage:system` |
| `update` (写) | `write:pages` 或 `manage:pages` 或 `manage:system` |
| `create` | `write:pages` 或 `manage:pages` 或 `manage:system` |
| `delete` | `delete:pages` 或 `manage:system` |
| 读取 `content` 字段 | `read:source` 或 `write:pages` 或 `manage:system` |

## 自签 JWT 不可靠的原因

以下流程已验证不可行：
1. 从 DB 提取 `certs.private` + `sessionSecret`
2. 用 Python `pyjwt` + `cryptography` 正确解密私钥并签发 RS256 JWT
3. Python 端 `jwt.decode()` 验证通过
4. 插入 `apiKeys` 表 + 重启 Wiki.js
5. Wiki.js 运行时仍拒绝该 JWT（Forbidden / Unauthorized）

可能原因：
- Node.js `jsonwebtoken` 与 Python `pyjwt` 在 PEM 密钥格式处理上有差异
- Wiki.js 可能缓存了旧的 `validApiKeys` 列表
- 密钥 passphrase 解析细节不同

**结论：不要自签 JWT，通过 Wiki.js 管理后台 UI 创建 API Key 是唯一可靠方式。**
