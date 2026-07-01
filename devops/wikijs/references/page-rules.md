# Wiki.js 页面权限双层判定：permissions vs pageRules

## 核心模型

Wiki.js v2 的页面权限**不是**只看 `groups.permissions` 这一个字段。判定路径是双层：

1. **groups.permissions** — 粗粒度能力清单（这个组"能拥有"哪些权限）
2. **groups.pageRules** — 路径级具体生效规则（针对实际页面路径，哪些角色才真正激活）

**两层都必须包含目标角色，操作才放行。** 只配 permissions 不配 pageRules，写操作会被静默拒绝，且错误信息可能误导（例如创建文档时返回 `PageDeleteForbidden 6010`，看起来像删除权限问题，实际是 write 检查被 pageRules 拦住）。

## 真实案例（2026-07-01）

用户给的 API Key（apiKeys.id=<你的key_id>）绑定 Manager 组（grp=4）。

数据库证据：

```
groups.id=4 (Manager).permissions =
  ["read:pages","read:assets","read:comments","write:comments",
   "write:pages","manage:pages","delete:pages","write:styles",
   "write:scripts","read:source","read:history","write:assets",
   "manage:assets","manage:comments","write:users","manage:users"]
   ↑ 看起来权限齐全

groups.id=4 (Manager).pageRules =
  [{"id":"default","deny":false,"match":"START",
    "roles":["read:pages","read:assets","read:comments","write:comments"],
    "path":"","locales":[]}]
   ↑ 实际生效只有这 4 个角色，没有 write:pages / manage:pages
```

测试结果（用同一个 token 对 https://your-wiki-domain.com/graphql 请求）：

| GraphQL 操作 | 结果 | 解释 |
|------------|------|------|
| `pages.list` | ✅ 33 页 | list 端点走 permissions 检查 |
| `pages.single(id:1) { content }` | ❌ PageViewForbidden 6013 | content 字段走 pageRules，缺 read:source |
| `pages.create(...)` | ❌ PageDeleteForbidden 6010 | **错误码误导**，实际是 write:pages pageRules 缺失 |
| `users.list` | ❌ Forbidden | 符合预期，Manager 无 manage:system |

## 诊断 SQL

```sql
-- 同时查看两个字段
SELECT id, name, permissions, "pageRules" FROM groups WHERE id = <group_id>;
```

判定要点：
- `permissions` 是字符串数组
- `pageRules` 是对象数组，每个对象的 `roles` 字段才是真正生效的权限集
- `match`：`START`（前缀匹配）/ `EXACT` / `END` / `REGEX` / `TAG` / `ALL`
- `path`: 空字符串 `""` 表示对所有路径生效
- `deny`: true 表示这条规则是拒绝规则

## 修复方案

### 方案 A — 重新签发 token（推荐）

在 Wiki.js 管理后台 → API Access → New API Key，Group 选 **Administrators**（id=1）。Administrators 默认 pageRules 完整，无此问题。

适用：用户能访问后台 UI，不想改组配置。

### 方案 B — 给现有组补 pageRules

```sql
-- 备份当前规则
SELECT "pageRules" FROM groups WHERE id = <你的key_id>;
-- 复制输出 JSON 备用作回滚

-- 写入完整规则（适用 Manager 组允许全站读写）
UPDATE groups
SET "pageRules" = '[{
  "id":"default","deny":false,"match":"START",
  "roles":["read:pages","write:pages","manage:pages","delete:pages",
           "read:assets","write:assets","manage:assets",
           "read:comments","write:comments","manage:comments",
           "read:source","read:history"],
  "path":"","locales":[]
}]'::jsonb
WHERE id = <你的key_id>;

-- 重启让 Wiki.js 重新加载组权限
docker restart wikijs
```

**注意：** 这影响**所有**绑定该组的用户和 API Key，不只是当前 token。如果只想给一个 API Key 写权限，用方案 A 或方案 C。

回滚：用备份的旧 JSON 再 UPDATE 一次。

### 方案 C — 新建专用组

最干净但步骤多：

1. UI 新建 "API Publisher" 组，permissions + pageRules 都配齐
2. 删除旧 API Key
3. 新建 API Key 绑定到新组
4. 替换调用方的 token

## 错误码对照

Wiki.js mutation 的错误码不总是反映真实原因：

| errorCode | slug | 真实可能原因 |
|-----------|------|------------|
| 6001 | PageGenericError | 各种内部错误 |
| 6010 | PageDeleteForbidden | **创建/更新也会返回这个**，根因是 pageRules 缺 write:pages |
| 6013 | PageViewForbidden | 读单页 content 缺 read:source 或 read:pages 在 pageRules 中 |

遇到 6010 不要只查删除权限，**先查 pageRules**。

## 与现有 SKILL.md 章节的关系

SKILL.md 的「Manager 组权限陷阱 + 静默降级为 Guest」章节说 Manager 组"数据库中明确有 write:pages 和 manage:pages 但 mutation 返回 Forbidden"，并把原因归到"静默降级为 Guest"。本文档补充：**还有一个独立的、更常见的原因 —— pageRules 字段没配齐**。两个原因要分别诊断：

- 用 `pages.list` 测试：能返回数据 → token 验证通过，不是 Guest 降级 → 看 pageRules
- 用 `pages.list` 测试：返回空或 Forbidden → 检查 JWT 是否被 passport-jwt 拒绝（Guest 降级）
