# Wiki.js API Key 内部机制

## createNewKey() 函数（/wiki/server/models/apiKeys.js）

```javascript
static async createNewKey ({ name, expiration, fullAccess, group }) {
    // 第一步：插入占位行（isRevoked: true, key: 'pending'）
    const entry = await WIKI.models.apiKeys.query().insert({
      name,
      key: 'pending',
      expiration: moment.utc().add(ms(expiration), 'ms').toISOString(),
      isRevoked: true
    })

    // 第二步：用当前实例私钥签发 JWT
    const key = jwt.sign({
      api: entry.id,        // 自增 ID
      grp: fullAccess ? 1 : group  // fullAccess=ture → 强制 Admin 组
    }, {
      key: WIKI.config.certs.private,
      passphrase: WIKI.config.sessionSecret
    }, {
      algorithm: 'RS256',
      expiresIn: expiration,
      audience: WIKI.config.auth.audience,
      issuer: 'urn:wiki.js'
    })

    // 第三步：更新 key 字段 + 取消吊销
    await WIKI.models.apiKeys.query().findById(entry.id).patch({
      key,
      isRevoked: false
    })

    return key
}
```

**关键点：**
- `fullAccess: true` → `grp: 1`（Administrators），有 `manage:system`
- `fullAccess: false` + 指定 group → 用具体 group ID
- JWT 由当前运行实例的私钥当场签名 → 无证书不匹配问题
- 这也是为什么 UI 创建的 key 总是能用，旧 key 可能被静默降级

## API Key 表结构

```
Table "public.apiKeys"
   Column   |          Type          | Nullable
------------+------------------------+----------
 id         | integer (auto)         | not null
 name       | character varying(255) | not null
 key        | text                   | not null
 expiration | character varying(255) | not null
 isRevoked  | boolean                | not null (default false)
 createdAt  | character varying(255) | not null
 updatedAt  | character varying(255) | not null
```

**没有 groupId 列！** 组绑定完全在 JWT payload 的 `grp` 字段中。

## wk_api_ 前缀 Key（旧格式）

`wk_api_...` 格式的 key 是旧版本遗留，不是 JWT。passport-jwt 无法解码，直接降级为 guest。
这些 key 完全不可用，应从数据库中删除或标记为吊销。

## auth.js 权限解析路径

```javascript
// 1. passport-jwt 验证 → 得到 payload（含 api, grp）
// 2. authenticate() 检查
if (_.has(user, 'api')) {                        // user 是 JWT payload
    if (_.includes(WIKI.auth.validApiKeys, user.api)) {  // 从 DB 加载的有效 key 列表
        req.user = {
            permissions: _.get(WIKI.auth.groups, `${user.grp}.permissions`, []),
            groups: [user.grp],
            // ...
        }
    }
}

// 3. GraphQL auth directive 检查
if (!_.some(context.req.user.permissions, pm => _.includes(requiredScopes, pm))) {
    throw new Error('Forbidden')
}
```

**WIKI.auth.groups** 由 `reloadGroups()` 填充（`init()` 时调用，未 await）：
```javascript
async reloadGroups() {
    const groupsArray = await WIKI.models.groups.query()
    this.groups = _.keyBy(groupsArray, 'id')  // {1: Admin, 2: Guest, 3: Member, 4: Manager}
}
```

**WIKI.auth.validApiKeys** 由 `reloadApiKeys()` 填充：
```javascript
async reloadApiKeys() {
    const keys = await WIKI.models.apiKeys.query().select('id')
        .where('isRevoked', false)
        .andWhere('expiration', '>', DateTime.utc().toISO())
    this.validApiKeys = _.map(keys, 'id')
}
```

## Docker 容器调试陷阱

**不要用 sed 注入日志到容器内的 JS 文件！** 极易导致语法错误，容器进入重启循环。

错误示例：
```
docker exec wikijs sed -i '179 a\console.log(...)' /wiki/server/core/auth.js
→ "Unexpected token '.'" → 容器崩溃
```

**正确恢复方式：**
```bash
docker stop wikijs
docker rm wikijs
cd /opt/workspace/wikijs && docker compose up -d --force-recreate
```

**调试最佳实践：** 不要修改源码，使用三步诊断法（list → flushCache → create）推断权限问题。

## 从 key 字符串解码绑定的组（调试用）

API Key 是 JWT，`grp`（绑定组）和 `api`（key ID）都在 payload 里，可直接解码查看：

```python
import base64, json
payload = key.split('.')[1] + '=' * (4 - len(key.split('.')[1]) % 4)
data = json.loads(base64.urlsafe_b64decode(payload))
print(f"group={data['grp']}, api_id={data['api']}")
```

查看所有 Key 的吊销/过期状态：
```sql
SELECT id, name, "isRevoked", expiration FROM "apiKeys";
```

## Mutation 权限的字段级细粒度

Wiki.js 对同一个 `update` mutation 的不同字段检查不同权限：
- 只更新 `description` → 检查 `manage:pages`
- 更新 `content` → 检查 `write:pages`（**单独校验！**）

所以可能出现"能改 description 但不能改 content"的情况，根因是组权限或 pageRules 不完整（见 `page-rules.md`）。
