# 上游来源说明

原始来源仓库：`https://github.com/liangdabiao/ecom-details-image`

最初导入范围：

- `scripts/generate_image.py`
- `references/templates/*.json`
- 安全版 `.env.example`

未导入内容：

- 已生成图片。
- 示例产品照片。
- 截图素材。
- 上游根目录 `.env.example`，因为其中包含形态接近真实 API Key 的注释示例。

后续整理内容：

- 重构为 `hermes-skills` 的 `skills/ecom-details-image/` 目录结构。
- 精简 `SKILL.md`，把详细规则拆到 `references/`。
- 新增中文 README。
- 将脚本改为 provider 架构，支持 `openai`、`gemini`、`apimart`。
- 保持脚本零第三方依赖。

授权提醒：

上游仓库导入时未声明 License。正式再分发、商业使用或打包发布前，应确认授权和署名要求。
