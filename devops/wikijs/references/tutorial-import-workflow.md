# 批量教程导入 Wiki.js 工作流

## 场景

从 GitHub 仓库（如 n8n 中文教程）批量导入内容到 Wiki.js，包括 Markdown 文件、截图、可下载工作流文件。

## 导入流程

### 1. 克隆源码仓库
```bash
cd /tmp && git clone --depth 1 <repo-url> tutorial-source
```

### 2. 创建 Wiki 目录结构

先创建文件夹页面，再在 pageTree 中注册：

```sql
-- 创建教程根目录页
INSERT INTO pages (path, hash, title, description, content, render,
  "isPublished", "contentType", "editorKey", "localeCode",
  "authorId", "creatorId", "createdAt", "updatedAt",
  extra, "publishStartDate", "publishEndDate")
VALUES ('home/tutorials/n8n', 'h_n8n_tut', 'n8n中文学习教程', '...',
  E'# n8n中文学习教程\n\n内容整理中...', E'# n8n中文学习教程\n\n内容整理中...',
  true, 'markdown', 'markdown', 'zh', 1, 1, NOW()::text, NOW()::text,
  '{}'::json, '', '') RETURNING id;

-- 注册到 pageTree（Wiki.js 重启会重建，但先插入可避免首次空白）
INSERT INTO "pageTree" (id, path, depth, title, "isPrivate", "isFolder",
  parent, "pageId", "localeCode", ancestors)
VALUES (35, 'home/tutorials/n8n', 3, 'n8n中文学习教程', false, true,
  34, 36, 'zh', '[1,37]'::json);
```

### 3. 批量生成 SQL（Python 脚本）

```python
import os, re

pages = [
    # (源文件路径, wiki路径, 标题, pageTree父ID, 深度, ancestors)
    (['README.md'], 'home/tutorials/n8n/overview', '教程总览', 35, 4, '[1,37,36]'),
    # ... 更多页面
]

page_id = 40
tree_id = 38

for sources, wiki_path, title, parent_tree, depth, ancestors in pages:
    # 读取并合并源文件
    content = ""
    for s in sources:
        with open(os.path.join(base_dir, s)) as f:
            content += f.read() + "\n\n"
    
    # 适配内容
    content = re.sub(r'\./images/', '/n8n-assets/images/', content)
    content = re.sub(r'<div[^>]*>', '', content)
    content = re.sub(r'</div>', '', content)
    
    # PostgreSQL E'...' 转义
    escaped = content.replace("'", "''")
    
    sql = f"INSERT INTO pages (...) VALUES (..., E'{escaped}', ...) RETURNING id;"
    tree_sql = f"INSERT INTO \"pageTree\" (...) VALUES (...);"
    # 写入 SQL 文件
```

### 4. 执行导入
```bash
docker exec -i your-postgres-container psql -U wikijs -d wikijs < import.sql
docker restart wikijs  # 让 Wiki.js 重建 pageTree
```

### 5. 托管静态资源

```bash
mkdir -p /var/www/n8n-assets/{images,workflows}
cp tutorial-source/*/images/*.png /var/www/n8n-assets/images/
cp tutorial-source/*/*.json /var/www/n8n-assets/workflows/
```

Nginx 配置见 `references/nginx-static-assets.md`。

### 6. 验证

```bash
# 验证页面可访问
curl -sI https://your-wiki-domain.com/zh/home/tutorials/n8n/overview | head -1
# 验证图片可访问
curl -sI https://your-wiki-domain.com/n8n-assets/images/xxx.png | head -1
# 验证 JSON 可下载
curl -sI https://your-wiki-domain.com/n8n-assets/workflows/xxx.json | head -1
```

## 关键陷阱

1. **`$$` heredoc 在 `docker exec` 中会静默失败** → 用 `E'...'` 转义或 chr(10) 拼接
2. **Wiki.js 重启从 `pages` 表重建 `pageTree`** → 手动插入的 pageTree 条目会被覆盖。先改 pages，再改 pageTree，最后重启
3. **`\n` 转义陷阱**：单引号字符串中 `\n` 是两个字面字符。必须用 `E'\n'` 或在 Python 中预处理为真实换行
4. **中文文件名 URL**：nginx alias 支持中文文件名，但建议创建 ASCII 符号链接使 URL 更简洁

## 目录结构最佳实践

为教程创建独立的根目录，不在首页下平铺：
```
home/tutorials/        ← 教程根目录（统一管理所有教程项目）
├── n8n/               ← n8n 教程
│   ├── overview
│   ├── nodes/         ← 节点详解子目录
│   └── cases/         ← 实战案例子目录
└── docker/            ← 未来：Docker 教程
```
