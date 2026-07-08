---
name: ecom-details-image
description: 创建以转化为目标的电商图片简报、商品主图、详情页 PDP、社媒广告图、UGC、直播间、虚拟试穿、平铺图、细节图、包装图、信息图和 Campaign 组图 Prompt，并可调用 OpenAI/ChatGPT 图片 API、Google Gemini 或 apimart.ai 直接生成图片。适用于产品视觉策略、Campaign Style Lock、多图风格统一、产品参考图生图和跨境/国内电商视觉生产。
metadata:
  hermes:
    version: 1.1.0
    author: liunina
    tags: [ecommerce, image-generation, product-photography, prompt, ads, pdp, openai, gemini]
    category: ecommerce
    platforms: [linux, macos]
---

# 电商图片生成

使用本 Skill 规划和生成电商视觉素材。默认文档、示例、图中文字建议和解释都以中文为主；最终生图 Prompt 默认使用英文，除非用户明确要求中文 Prompt 或需要中文图中文字。

本 Skill 有两种工作模式：

- **Brief / Prompt 模式**：只输出视觉简报、转化诊断、Campaign Style Lock 和最终生图 Prompt，不调用 API。
- **Generate 模式**：当用户明确要求“生成图片、直接出图、调用 API、render image”时，先产出 Prompt，再调用 `scripts/generate_image.py`。

不要索要、打印、提交或回显真实 API Key。缺少 API 配置时，返回 Prompt 和配置说明，不要尝试调用脚本。

## 核心流程

1. 明确产品、目标平台、图片用途、受众、品类、比例、是否需要图中文字、参考图路径和负面约束。
2. 判断是单图、社媒组图、广告组图，还是完整 PDP/详情页图片包。
3. 从 `references/templates/` 匹配模板，只读取相关模板。
4. 对商品图、广告图、PDP 图先做转化驱动力诊断：
   - 视觉吸引
   - 痛点消除
   - 情绪/身份价值
   - 信任证明
5. 多图任务必须先定义 **Campaign Style Lock**，并把同一段锁定规则原样放入每张 Prompt。
6. 写 Prompt 时必须给出可执行约束：色值、产品占比、留白、光线、构图、平台安全区、图中文字和负面约束。
7. 直出图片时，根据配置选择提供方：
   - `openai`：OpenAI / ChatGPT 图片 API。
   - `gemini`：Google Gemini 图片生成。
   - `apimart`：apimart.ai 异步轮询兼容。
8. 返回生成文件路径、最终 Prompt、关键假设和下一步建议。

## 何时读取参考文件

- 写电商转化 Prompt、多图一致性、UGC 真实感、图中文字或 PDP 图片包时，读取 `references/prompt-rules.md`。
- 配置 OpenAI、Gemini、apimart 或调试脚本参数时，读取 `references/api-config.md`。
- 需要了解导入来源和授权注意事项时，读取 `references/upstream.md`。

## 模板选择

| 用户需求 | 模板 |
|---|---|
| 主图、白底图、纯色底、packshot | `01-hero-image.json` |
| 场景图、生活方式、家居、户外 | `02-lifestyle-scene.json` |
| 平铺、俯拍、搭配陈列 | `03-flat-lay.json` |
| 细节、材质、纹理、工艺 | `04-detail-macro.json` |
| 海报、Banner、促销 | `05-poster-banner.json` |
| 小红书、Instagram、TikTok、X/Twitter | `06-social-media.json` |
| UGC、买家秀、真实评价、手机随拍 | `07-ugc-style.json` |
| 模特、真人上身、服装展示 | `08-model-showcase.json` |
| 前后对比、效果对比 | `09-before-after.json` |
| 包装、礼盒、开箱 | `10-packaging.json` |
| 信息图、A+ Content、详情页卖点图 | `11-infographic.json` |
| 创意概念、品牌大片、艺术广告 | `12-creative-concept.json` |
| 尺寸、规格、步骤 | `13-size-spec.json` |
| 套装、组合、多 SKU | `14-multi-product.json` |
| 直播、带货、直播间截图 | `15-livestream.json` |
| 虚拟试穿、产品融入场景 | `16-try-on-virtual.json` |
| 拆解图、爆炸图、结构说明 | `17-exploded-view.json` |
| 隐形人台、服装 3D 展示 | `18-ghost-mannequin.json` |
| 多角度、网格、360 展示 | `19-multi-angle-grid.json` |
| 杂志、封面、编辑部大片 | `20-magazine-editorial.json` |
| 节日、季节、主题 Campaign | `21-seasonal-campaign.json` |
| 轻奢、高级氛围、精品质感 | `22-luxury-atmospherics.json` |
| 设备样机、App、SaaS、屏幕展示 | `23-device-mockup.json` |
| 店铺、门店、货架、展柜 | `24-storefront.json` |
| 运动、健身、户外 Campaign | `25-sports-campaign.json` |

无明显匹配时，从 `01-hero-image.json` 开始，再按用户场景组合其他模板。

## PDP 默认图片包

当用户提到“详情页、PDP、Amazon A+、Shopify 商品页、主图堆栈、整套商品图、商品详情图片”时，默认规划：

- 5 张方形主图。
- 7-9 张竖版详情页图。
- 1 段共享 Campaign Style Lock。
- 从“首屏理解”到“信任和行动”的转化顺序。

默认模块：

- H1：首图，一眼看懂产品和核心承诺。
- H2：材质、功能或核心卖点特写。
- H3：典型使用场景。
- H4：对比、前后差异或升级理由。
- H5：优惠、保障、物流或 CTA。
- D1：为谁解决什么问题。
- D2：痛点放大。
- D3：机制或结构解释。
- D4：2-4 个核心利益。
- D5：使用步骤。
- D6：场景覆盖。
- D7：对比选择。
- D8：信任背书。
- D9：FAQ、风险逆转或 CTA。

## 提供方选择建议

- **OpenAI / ChatGPT**：优先用于标准电商主图、产品一致性要求高、需要 OpenAI 官方图片 API 的场景。
- **Google Gemini**：优先用于需要 Gemini 图像能力、已有 Google API Key、或想对比 Gemini 出图风格的场景。
- **apimart**：保留给已有 apimart.ai 工作流或需要其异步轮询接口的用户。

用户未指定时，根据 `.env` 自动判断；更推荐明确设置 `IMG_PROVIDER=openai` 或 `IMG_PROVIDER=gemini`。

## 生图示例

OpenAI / ChatGPT：

```bash
python3 scripts/generate_image.py \
  --provider openai \
  --prompt "clean product hero image, #FFFFFF background, product occupies 38% of frame" \
  --size 1:1 \
  --resolution 2k
```

Google Gemini：

```bash
python3 scripts/generate_image.py \
  --provider gemini \
  --prompt-file prompt.txt \
  --image product.jpg \
  --output-dir generated-images \
  --size 4:5 \
  --resolution 2k
```

使用 `.env.example` 创建本地 `.env`。真实 `.env` 不要提交到仓库。

## 交付格式

默认回复结构：

1. 关键假设。
2. 转化驱动力诊断。
3. Campaign Style Lock。
4. 图片序列规划。
5. 每张图的最终 Prompt。
6. 如果已直出图片，列出生成文件路径。
7. 如果未直出图片，列出需要补齐的 API 配置。

## 来源说明

本 Skill 改编自 `liangdabiao/ecom-details-image`，并重构为 `hermes-skills` skill tap 结构。上游仓库导入时未声明 License，正式再分发前应确认授权。
