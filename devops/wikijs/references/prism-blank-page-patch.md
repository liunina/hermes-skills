# Wiki.js Prism.js 白屏补丁详解

Wiki.js v2.5.314 的默认主题（theme0.js）有三个已知 bug，在特定条件下会阻止 Vue 客户端应用挂载，导致浏览器白屏。

## 症状

- SSR 输出正常（HTML 源码含 `<page>` 组件和完整内容）
- 浏览器 DevTools Console 报以下错误：
  1. `TypeError: Cannot read properties of undefined (reading 'querySelectorAll')` at `highlightAllUnder`
  2. `Prism.plugins.toolbar.registerButton: "copy-to-clipboard" registered already`
  3. `TypeError: Cannot read properties of null (reading 'length')` at theme0.js `a.i`

## 根因

### Bug 1: `highlightAllUnder` 空指针（⚠️ 补丁匹配串陷阱）

theme0.js 的 `mounted()` 生命周期中调用 `Prism.highlightAllUnder(this.$refs.container)`。
webpack 打包后的实际代码是 `h.a.highlightAllUnder(this.$refs.container)`。

**⚠️ 致命陷阱：不能只匹配 `highlightAllUnder(this.$refs.container)`！**
否则替换会把守卫插入到 `h.a.` 和 `highlightAllUnder` 中间，变成 `h.a.this.$refs.container&&...` → `this` undefined → 崩溃。

**修复：完整匹配 webpack 打包后的代码**
```js
// Before（webpack 打包后）
h.a.highlightAllUnder(this.$refs.container)
// After
this.$refs.container&&h.a.highlightAllUnder(this.$refs.container)
```

### Bug 2: `registerButton` 重复注册 ⚠️ 不修复

theme0.js 在组件初始化时调用 `Prism.plugins.toolbar.registerButton('copy-to-clipboard', ...)`。
若组件多次挂载/卸载（例如客户端导航），Prism.js 抛出 "already registered" 错误。

**结论：不修复。** 原因：

1. **匹配串陷阱**：代码中实际是 `h.a.plugins.toolbar.registerButton("copy-to-clipboard",e=>{`。如果用 `registerButton("copy-to-clipboard",e=>{` 匹配并替换为 `try{registerButton(...`，结果变成 `h.a.plugins.toolbar.try{registerButton(...` — 语法错误（`try` 被插入到了 property access 中间）。

2. **表达式上下文限制**：即使用正确匹配串（包含 `h.a.plugins.toolbar.` 前缀），`try` 是 statement 而非 expression。registerButton 调用位于逗号分隔的表达式序列中（webpack chunk 顶层），`try{...}catch(e){}` 不能放在表达式位置。

3. **不需要修复**：Bug #1（highlightAllUnder）和 #3（tocDecoded）才是导致白屏的 TypeError 崩溃。registerButton "already registered" 是 Prism.js 的 warning 日志，不会阻止 Vue 挂载。页面正常渲染后，该 warning 仍会在多页面导航时出现，但无实际影响。

```js
// ❌ 错误 — 不要用！
// 匹配串太短 + try 不能在表达式位置
content.replace('registerButton("copy-to-clipboard",e=>{', 'try{registerButton(...')
// 结果: h.a.plugins.toolbar.try{registerButton(  ← 语法错误

// ❌ 错误 — IIFE 也不行
// 逗号表达式序列中插入 IIFE 同样语法错误
```

### Bug 3: `tocDecoded.length` 空指针
当页面没有目录（TOC 为 null）时，Vue 的 render 函数中 `e.tocDecoded.length` 对 null 调用 `.length` 导致 TypeError，整个渲染树崩溃。

**修复：** 空值守卫
```js
// Before
e.tocDecoded.length
// After
(e.tocDecoded || []).length
```

## 一键补丁脚本

```python
from hermes_tools import terminal

# 1. 备份
terminal('docker cp wikijs:/wiki/assets/js/theme0.js /tmp/theme0.js')
terminal('cp /tmp/theme0.js /tmp/theme0.js.bak')

# 2. 读取并修复
with open('/tmp/theme0.js') as f:
    content = f.read()

# 检查是否已打过补丁
patched = all([
    'this.$refs.container&&highlightAllUnder' in content,
    '(e.tocDecoded||[]).length' in content
])

if not patched:
    # Bug 1 — highlightAllUnder 空指针（⚠️ 必须完整匹配 webpack 打包后的 h.a. 前缀）
    content = content.replace(
        'h.a.highlightAllUnder(this.$refs.container)',
        'this.$refs.container&&h.a.highlightAllUnder(this.$refs.container)'
    )
    # Bug 2 — registerButton 不修复（⚠️ try 无法用于表达式上下文）
    # Bug 3 — tocDecoded 空指针
    # ⚠️ 不要加 navPref "browse" 补丁 — 会让整个 Vue app 崩溃（见 SKILL.md 陷阱章节）
    content = content.replace(
        'e.tocDecoded.length',
        '(e.tocDecoded||[]).length'
    )
    with open('/tmp/theme0.js', 'w') as f:
        f.write(content)
    print(f'Patched: {len(content)} bytes')
else:
    print('Already patched')

# 3. 部署
terminal('docker cp /tmp/theme0.js wikijs:/wiki/assets/js/theme0.js')
terminal('docker restart wikijs')
```

## 验证

```bash
# 确认补丁生效
curl -s https://your-wiki-domain.com/_assets/js/theme0.js | grep -c 'refs.container&&highlightAllUnder'
# 应输出: 1

# 确认页面 SSR 正常
curl -s https://your-wiki-domain.com/ | grep -c 'app-error\|Oops'
# 应输出: 0
```
