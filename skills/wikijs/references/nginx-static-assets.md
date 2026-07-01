# Nginx 静态资源服务于常见陷阱

## sites-available vs sites-enabled 陷阱

**症状：** 修改 `/etc/nginx/sites-available/your-wiki-domain.com` 后 `nginx -t` 通过但改动不生效。

**根因：** Nginx 实际读取的是 `/etc/nginx/sites-enabled/` 下的文件，而非 `sites-available/`。`sites-available` 是配置文件仓库，`sites-enabled` 是激活的符号链接（或直接副本）。

**诊断：**
```bash
# 检查两者是否一致
diff /etc/nginx/sites-available/your-wiki-domain.com /etc/nginx/sites-enabled/your-wiki-domain.com
```

**修复：** 直接编辑 `sites-enabled` 中的文件，或编辑 `sites-available` 后确保符号链接正确。

## 静态资源 location 模式

### 教程图片/文件托管

当 Wiki.js 教程需要托管图片和可下载文件（JSON 工作流等），用 nginx `alias` 比 Wiki.js 内置资产系统更简单：

```nginx
# 在 your-wiki-domain.com 的 server 块中，放在 /_assets/ 之前
location /n8n-assets/ {
    alias /var/www/n8n-assets/;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

**目录结构：**
```
/var/www/n8n-assets/
├── images/          # 19 张 PNG 截图
│   ├── if-node-workflow-example.png
│   └── ...
└── workflows/       # 4 个 JSON 工作流文件
    ├── case1-sitemap.json
    ├── case2-crawler-v1.json
    └── ...
```

**页面中的引用：**
```markdown
![截图](/n8n-assets/images/xxx.png)
[下载工作流](/n8n-assets/workflows/case1-sitemap.json)
```

**中文文件名处理：** 使用符号链接将中文文件名映射为 ASCII 别名：
```bash
cd /var/www/n8n-assets/workflows
ln -sf "检查站点http请求状态.json" case1-sitemap.json
```

### alias vs root 区别

- `alias /var/www/n8n-assets/;` — `/n8n-assets/xxx` → `/var/www/n8n-assets/xxx`
- `root /var/www/;` — `/n8n-assets/xxx` → `/var/www/n8n-assets/xxx`

两者效果等价，但 `alias` 末尾必须有 `/`。用 `alias` 更清晰表达"这个 URL 映射到这个目录"。

## sites-enabled 中注意 location 顺序

nginx location 匹配优先级：`=` > `^~` > `~` > 前缀。确保静态资源 location 在 `/` catch-all 之前，否则请求会被代理到后端。
