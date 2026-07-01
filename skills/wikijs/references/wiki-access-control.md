# Wiki.js 访问控制 — 公开/私有模式

## 权限模型

Wiki.js 权限分两层：
1. **Groups → permissions**（粗粒度能力清单，如 `read:pages`）
2. **Groups → pageRules**（路径级规则，控制哪些路径应用哪些权限）

Guest 用户（未登录）属于 `Guests` 组（id=2）。

## 检查当前状态

```sql
SELECT id, name, permissions, "pageRules" FROM groups WHERE id = 2;
```

## 设为私有模式（全部页面需登录）

```sql
-- 1. 从 Guests 组撤掉 read:pages
UPDATE groups SET permissions = '["read:assets","read:comments"]' WHERE id = 2;

-- 2. 从 pageRules 撤掉 read:pages
UPDATE groups SET "pageRules" = '[{"id":"guest","roles":["read:assets","read:comments"],"match":"START","deny":false,"path":"","locales":[]}]' WHERE id = 2;

-- 3. 重启生效
-- docker restart wikijs
```

## 开放单个页面给匿名访问

```sql
-- 追加一条 pageRule：允许 guest 读取特定路径
UPDATE groups SET "pageRules" = "pageRules" || '[{"id":"guest-inbox","roles":["read:pages"],"match":"EXACT","deny":false,"path":"home/inbox","locales":["zh"]}]'::jsonb WHERE id = 2;
```

**match 模式：**
- `EXACT` — 精确匹配路径
- `START` — 路径前缀匹配（`path: "home"` 匹配 `home/*` 全部子路径）

## 恢复公开模式

```sql
UPDATE groups SET permissions = '["read:pages","read:assets","read:comments"]' WHERE id = 2;
UPDATE groups SET "pageRules" = '[{"id":"guest","roles":["read:pages","read:assets","read:comments"],"match":"START","deny":false,"path":"","locales":[]}]' WHERE id = 2;
```

## 验证

```bash
# 匿名访问 → 私有模式应返回 302（跳转登录）或 403
curl -s -o /dev/null -w "%{http_code}" https://your-wiki-domain.com/
curl -s -o /dev/null -w "%{http_code}" https://your-wiki-domain.com/zh/home/areas/ops/servers
```
