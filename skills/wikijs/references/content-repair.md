# Content Repair — 修复 Wiki.js 页面内容

## 通过 Python 安全更新页面内容

**⚠️ 禁止用 psql 输出做 SELECT→修改→UPDATE**。psql 会对长行加 `+` 续行符污染数据。

**正确：文件管道方式**

```python
import subprocess

content = """# 首页

完整的 Markdown 内容...
多行文本保留真实换行符"""

# 1. 写入 SQL 文件（避免命令行参数溢出）
escaped = content.replace("'", "''")
sql = f"UPDATE pages SET content = E'{escaped}', render = E'{escaped}', \"updatedAt\" = NOW()::text WHERE id = 1;"

with open('/tmp/update.sql', 'w') as f:
    f.write(sql)

# 2. 管道导入（避免 heredoc 转义问题）
subprocess.run(
    ['docker', 'exec', '-i', 'your-postgres-container', 'psql', '-U', 'wikijs', '-d', 'wikijs'],
    input=open('/tmp/update.sql', 'rb').read(), capture_output=True
)
```

## Vue 模板转义（导入教程类内容必做）

内容中的 `{{ }}` 和 `$变量` 会被 Wiki.js 的 Vue 前端当成模板表达式，触发 ReferenceError 导致白屏。

```python
# 转义 {{ }} —— 花括号间加空格
content = content.replace('{{', '{ {')
content = content.replace('}}', '} }')

# 转义 n8n $变量
for var in ['$json', '$input', '$workflow', '$execution', '$now', '$today',
            '$env', '$jmespath', '$runIndex', '$itemIndex']:
    content = content.replace(var, '\\' + var)
```

**不要用 HTML 实体（`&#123;&#123;`）→ 浏览器解码后 Vue 仍会解析。**

## 诊断：检查内容是否有字面量换行符问题

```bash
# 比较正常页面和可疑页面的内容
docker exec your-postgres-container psql -U wikijs -d wikijs -c "SELECT content FROM pages WHERE id = 1;" | cat -A
docker exec your-postgres-container psql -U wikijs -d wikijs -c "SELECT content FROM pages WHERE id = 3;" | cat -A

# 正常页面：真实换行显示为 $（行尾标记）
# 异常页面：literal \n 显示为 \n（反斜杠+n）
```

## 诊断：SSR 故障快速分类

```bash
# 1. 检查 SSR 是否有 page 组件
curl -s https://your-wiki-domain.com/ | grep -c '<page locale'

# 2. 检查是否有错误
curl -s https://your-wiki-domain.com/ | grep -c 'app-error\|Oops\|Error'

# 3. 检查内容为空
curl -s https://your-wiki-domain.com/ | grep -o '<div id="root">.*</div>' | head -1
```
