# Wiki.js 空白页完整排查流程

## 排查顺序（严格按此顺序，不要跳步）

### 第 0 步：nginx 端口验证（30 秒，先做！）

端口不匹配是所有排查中最常见的根因，不做这步可能白费几十分钟。

```bash
# 1. 查 Docker 端口映射
docker ps --filter name=wikijs --format '{{.Ports}}'
# → 127.0.0.1:3010->3000/tcp  (宿主机端口 = 3010)

# 2. 查 nginx proxy_pass
grep proxy_pass /etc/nginx/sites-available/your-wiki-domain.com
# → proxy_pass http://127.0.0.1:3010;  ← 必须与上面一致

# 3. 如果不一致 → 修复 nginx 后 reload
sed -i 's|proxy_pass http://127.0.0.1:旧端口;|proxy_pass http://127.0.0.1:正确端口;|' \
  /etc/nginx/sites-available/your-wiki-domain.com
nginx -t && nginx -s reload
```

### 第 1 步：查看 SSR 输出分类

```bash
curl -s https://your-wiki-domain.com/ | grep -o '<div id="root">[^<]*'
```

| 看到什么 | 跳到 |
|---------|------|
| `<div id="root"><page` ... | 第 2 步（客户端问题） |
| `<div id="root"><!----></div>` | 第 A 步（可能是客户端崩溃或 SSR 换行符问题） |
| `<div id="root">` 空 | 第 0 步（nginx 端口） |
| "Page has no rendered version" | render 字段为 NULL |
| "Error \| Wiki" | render 是预渲染 HTML |

### 第 2 步：检查数据库

```bash
docker exec your-postgres-container psql -U wikijs -d wikijs -c \
  "SELECT id, path, title, length(content) as clen, length(render) as rlen, \"isPublished\" FROM pages WHERE id = 1;"
```

确认：`clen == rlen > 0`，`isPublished = t`。

```bash
# 验证换行符是否为真正换行（非字面量 \n）
docker exec your-postgres-container psql -U wikijs -d wikijs -c "SELECT content FROM pages WHERE id = 1;" | cat -A | head -3
# 正常：每行以 $ 结尾。异常：出现 \n 字面量。
```

### 第 3 步：清缓存 + 重建 pageTree + 重启

```bash
docker exec wikijs rm -rf /wiki/data/cache/*
docker exec your-postgres-container psql -U wikijs -d wikijs -c 'DELETE FROM "pageTree";'
docker restart wikijs
sleep 10
# 验证 pageTree 重建
docker exec your-postgres-container psql -U wikijs -d wikijs -c "SELECT count(*) FROM \"pageTree\";"
```

### 第 4 步：应用 Prism.js / TOC 安全补丁

```bash
# 备份原始文件
docker cp wikijs:/wiki/assets/js/theme0.js /tmp/theme0.js
cp /tmp/theme0.js /tmp/theme0.js.bak

# 两处安全修复（不要 patch registerButton，见 SKILL.md 说明）
python3 << 'PYEOF'
with open('/tmp/theme0.js') as f: c = f.read()
c = c.replace('highlightAllUnder(this.$refs.container)', 'this.$refs.container&&highlightAllUnder(this.$refs.container)')
c = c.replace('e.tocDecoded.length', '(e.tocDecoded||[]).length')
with open('/tmp/theme0.js','w') as f: f.write(c)
print('Patched:', len(c), 'bytes')
PYEOF

# 部署并重启
docker cp /tmp/theme0.js wikijs:/wiki/assets/js/theme0.js
docker restart wikijs
sleep 10

# 验证补丁在位
docker exec wikijs cat /wiki/assets/js/theme0.js | grep -c "this.\$refs.container&&highlightAllUnder"
# 应输出: 1
```

### 第 5 步：nginx 禁用 JS 缓存

在 nginx your-wiki-domain.com 配置中，`location /wiki-save` 之后、`location /` 之前插入：

```nginx
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

```bash
nginx -t && nginx -s reload
curl -sI https://your-wiki-domain.com/_assets/js/app.js | grep -i cache
# 应返回: Cache-Control: no-store, must-revalidate
```

### 第 6 步：重建容器（最终手段）

如果以上全部做完仍然白屏，浏览器缓存了带旧 build ID 的 JS：

```bash
cd /opt/workspace/wikijs
docker compose down
docker compose up -d    # ⚠️ 可能需 background=true
sleep 12
# ⚠️ 重建后容器恢复为原始 image，补丁丢失，必须重打！
docker cp /tmp/theme0.js wikijs:/wiki/assets/js/theme0.js
docker restart wikijs
sleep 10
curl -s https://your-wiki-domain.com/ | grep -c "Error\|app-error\|Oops"  # 应输出 0
```

### 最终验证

```bash
# SSR 无错误
curl -s https://your-wiki-domain.com/ | grep -c "Error\|app-error\|Oops"
# → 0

# pageTree 完整
docker exec your-postgres-container psql -U wikijs -d wikijs -c "SELECT count(*) FROM \"pageTree\";"
# → 33（或你实际页面数）

# 补丁在位
docker exec wikijs cat /wiki/assets/js/theme0.js | grep -c "this.\$refs.container&&highlightAllUnder"
# → 1

# Cache-Control 生效
curl -sI https://your-wiki-domain.com/_assets/js/app.js | grep -i cache
# → Cache-Control: no-store, must-revalidate
```

## 常见误判

| 误判 | 实际 |
|------|------|
| 浏览器 `<div id="root"><!----></div>` 说明 SSR 坏了 | 可能只是客户端 JS 崩溃后 Vue 清空了 DOM。用 `curl` 确认 SSR 实际输出 |
| curl 返回空 → 数据库问题 | 先查 nginx 端口！304错端口 curl 也能返回内容（连接拒绝时 nginx 有 fallback） |
| 补丁打好了就没事了 | 浏览器可能缓存了不带补丁的旧 JS，必须加 Cache-Control 头或重建容器 |
| 重启就行 | 重启不改变 build ID，浏览器仍用旧缓存。需重建容器或清浏览器缓存 |
