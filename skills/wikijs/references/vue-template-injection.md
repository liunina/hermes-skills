# Vue 模板注入陷阱 — Wiki.js 白屏根因

## 问题

Wiki.js v2.5.314 将原始 Markdown 放在 `<div>` 中通过 SSR 发送，客户端 Vue hydration 时，
如果 Markdown 包含 `{{ }}` 或 `$variable`，Vue 模板编译器会当作表达式执行，
导致 `ReferenceError` → Vue 挂载失败 → `#root` → `<!---->` → 白屏。

## 症状
- Console: `ReferenceError: $json is not defined`
- `#root` → `<!---->`
- SSR 正常、JS/CSS 200 OK

## 触发模式（n8n 教程中）
- `{{ $json['标题'] }}`
- `{{$runIndex}}`
- `{{ $input.item }}`

## ❌ 无效修复
- `&#123;&#123;` HTML 实体 — 浏览器解码后 Vue 照样解析

## ✅ 正确修复

### 拆分花括号
```sql
UPDATE pages SET content = replace(content, '{{', '{ {') WHERE path LIKE '...';
UPDATE pages SET content = replace(content, '}}', '} }') WHERE path LIKE '...';
```
加注释："实际使用时去掉中间空格"

### 转义 $variable
```sql
UPDATE pages SET content = replace(content, '$json', '\$json') WHERE path LIKE '...';
-- 同理：$input $workflow $execution $now $today $env $jmespath $runIndex $itemIndex
```

## 验证命令
```bash
curl -s https://your-wiki-domain.com/zh/PATH | python3 -c "
import sys,re;h=sys.stdin.read()
s=h.find('slot=\"contents\"');e=h.find('</template>',s)
d=h[s:e];div=d[d.find('<div>')+5:d.find('</div>')]
print(f'raw={len(re.findall(r\"(?<!&#123;)\{\{(?!\s)\",div))} ent={div.count(\"&#123;\")}')" 
# raw=0 ent=0 → OK
```
