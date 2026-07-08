# Prompt 规则

本文件用于生成电商图片 Prompt。默认说明和文档用中文；每张最终生图 Prompt 默认同时输出中文和英文两版，并保留必要的中文图中文字。

## 总体原则

1. 先明确商业目标，再写画面。
2. 先锁定整套视觉系统，再拆单张图。
3. 用数字和色值替代模糊形容词。
4. 保留平台叠加区、文字区和留白。
5. 负面约束必须具体。
6. 有产品参考图时，优先传 `--image`，不要只靠文字描述产品外观。
7. 除非用户明确要求只输出一种语言，否则每张图都输出“中文提示词”和“英文 Prompt”。

## 双语 Prompt 输出规范

每张图必须默认包含两版：

- **中文提示词**：给用户复核画面意图，也可复制到中文生图工具。中文提示词必须完整，不是英文 Prompt 的摘要。
- **英文 Prompt**：作为默认执行版本，适合 OpenAI / ChatGPT、Gemini 和多数英文提示更稳定的生图模型。

两版必须表达同一张图，不允许出现画面目标、产品角度、颜色、图中文字、负面约束不一致。

推荐输出格式：

```markdown
### H1 主图

用途：首图，一眼看懂产品和核心卖点。

中文提示词：
...

English Prompt:
...

负面约束：
...
```

如果用户要求“直接出图”，脚本默认使用英文 Prompt 写入 prompt 文件；中文提示词仍保留在回复中，便于复核和后续修改。

## 提供方差异

### OpenAI / ChatGPT

适合：

- 标准商品主图。
- 需要较稳定产品外观的参考图生图。
- 电商详情页中需要清晰构图和较高一致性的图片。

Prompt 写法建议：

- 结构清晰，少堆关键词。
- 明确比例、产品占比、背景色、留白和禁止项。
- 图中文字尽量少，中文必须用 `「」` 包起来。
- 需要参考产品图时，明确写“keep the exact product shape, color, material, and key visible details from the reference image”。

### Google Gemini

适合：

- 想对比 Gemini 出图风格。
- 需要较强语义理解、场景生成或图文布局尝试。
- 已有 Google API Key 的团队。

Prompt 写法建议：

- 把画面任务拆成明确段落：产品、场景、构图、文字、禁止项。
- 对参考图写清楚哪些必须保留，哪些可以变化。
- 如果比例很重要，直接写 “aspect ratio must be 4:5”。
- 如果要中文文字，给出短文案并要求 “render the Chinese text exactly as: 「...」”。

## Campaign Style Lock

多图任务必须先定义一段 Campaign Style Lock，并把它原样放进每张 Prompt。

必须包含：

- 视觉方向：例如 premium clean ecommerce、warm lifestyle、tech product launch。
- 固定色板：2-3 个主色 + 1 个强调色，写 hex。
- 冷暖调：warm / cool / neutral。
- 字体系统：例如 modern geometric sans-serif。
- 背景系统：白底、浅灰棚拍、家居空间、户外等。
- 光线系统：光源方向、色温、阴影强弱。
- 布局系统：留白、分栏、标签、圆角、图标风格。
- 产品呈现规则：角度、占比、是否居中、是否允许手持。
- 禁止漂移项：禁止换色板、混字体、乱背景、错图标。

示例：

```text
Campaign Style Lock: premium clean ecommerce style; palette #FFFFFF background, #2D2D2D text, #D4AF37 accent; neutral 5500K studio lighting; modern geometric sans-serif typography; clean studio background; soft shadow below product; at least 45% whitespace; thin-line icons in #2D2D2D; product angle stays front 15-degree perspective; no palette drift, no mixed fonts, no inconsistent lighting, no random backgrounds, no mismatched icon styles.
```

## 电商 Prompt 标准结构

按这个顺序写：

1. Campaign Style Lock，多图任务必填。
2. 参考图保真要求，如果有产品图。
3. 主体和场景。
4. 图片目标：首图、卖点图、详情页、社媒、广告等。
5. 构图：产品位置、占比、视角、镜头、裁切。
6. 光线、色彩、材质和纹理。
7. 图中文字：具体文案、层级、位置、字体风格。
8. 平台要求：比例、安全区、留白。
9. 负面约束。

## 数字化约束

常用颜色：

- 白底：`#FFFFFF`
- 深灰文字：`#2D2D2D`
- 金色强调：`#D4AF37`
- 浅米色背景：`#F5F1E8`
- 深绿色背景：`#1A3A2E`
- 科技蓝黑背景：`#0B1020`

产品占比：

| 图片类型 | 建议产品占比 |
|---|---|
| 白底主图 | 35-40% |
| 卖点副图 | 25-30% |
| 场景氛围图 | 20-25% |
| 信息流广告 | 40% 左右 |
| 搜索广告 | 45% 左右 |
| SKU 多规格卡 | 整体 60-70% |

留白：

- 主图、卖点图、广告图：至少 45%。
- 场景氛围图：至少 50%。
- 竖版详情页模块：50% 以上。

国内电商主图可按需预留：

- 顶部中央 `200x100 px` 区域留空，用于平台价格或活动叠加。
- 左上角 `200x100 px` 区域留空，用于店铺 logo 或平台标签。

## 图中文字规则

图中文字必须控制层级：

- 主标题：一个核心承诺，中文不超过 15 字。
- 证据点：2-3 个，图标 + 短标签。
- CTA：中文不超过 8 字。

中文文案必须用中文引号包起来：

```text
Render the headline exactly as: 「轻薄透气」
```

避免：

- 一张图塞太多文字。
- 长句和复杂字。
- 让模型生成大段参数表。
- 未经证明的“第一、最强、治愈、官方认证”等说法。

## 负面约束

每条最终 Prompt 末尾都要写具体禁止项：

```text
Do not add: watermark, fake logo, extra products, hands, random props, cluttered background, gradient background, distorted text, unreadable labels, inconsistent product color.
```

高风险品类补充：

```text
Do not imply medical cure, guaranteed results, official certification, platform endorsement, or fake laboratory proof.
```

## UGC / 社媒 / 直播真实感

需要真实感时：

- 指定设备：`iPhone 15 Pro`、`iPhone 14 Pro`。
- 加轻微噪点、暖色偏移、不完美构图。
- 写真实环境：浴室台面、办公桌、水杯、毛巾、包装袋等。
- 使用 `NOT professional photography`、`NOT retouched`、`NOT smoothed`。
- 避免 `perfect`、`flawless`、`stunning`、`hyper-realistic`。
- 有人物时，保留自然皮肤纹理和真实阴影。

## PDP 图片包顺序

完整详情页建议按转化链路排列：

1. H1：首图，一眼看懂产品。
2. H2：材质或功能特写。
3. H3：使用场景。
4. H4：对比或前后差异。
5. H5：信任、优惠或 CTA。
6. D1：为谁解决什么问题。
7. D2：痛点放大。
8. D3：机制解释。
9. D4：核心利益。
10. D5：使用步骤。
11. D6：场景覆盖。
12. D7：对比选择。
13. D8：信任背书。
14. D9：FAQ、风险逆转或 CTA。

## 输出格式

最终给用户时建议包含：

- 中文视觉简报。
- 中文转化诊断。
- Campaign Style Lock。
- 图片清单和用途。
- 每张图的中文提示词。
- 每张图的英文 Prompt。
- 每张图的负面约束。
- 如果要直出图，附运行命令和输出路径。
