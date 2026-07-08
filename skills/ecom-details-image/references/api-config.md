# API 配置说明

`scripts/generate_image.py` 支持三种图片提供方：

- `openai`：OpenAI / ChatGPT 图片 API。
- `gemini`：Google Gemini Interactions API。
- `apimart`：apimart.ai 异步任务轮询兼容。

脚本不依赖第三方 Python 包。

## 推荐配置方式

在 `skills/ecom-details-image/` 下复制配置模板：

```bash
cp .env.example .env
```

然后只保留一个方案生效。

### OpenAI / ChatGPT

```dotenv
IMG_PROVIDER=openai
IMG_BASE_URL=https://api.openai.com/v1
IMG_MODEL=gpt-image-2
IMG_API_KEY=your-openai-api-key
```

说明：

- `IMG_PROVIDER=openai` 会调用 `/images/generations`。
- 如果传入 `--image`，会调用 `/images/edits`，更适合产品参考图生图。
- `--image` 可以重复传入多张，OpenAI 会以 `image[]` multipart 字段提交。
- 默认 `gpt-image-2` 会按 `--size` 和 `--resolution` 生成合法像素尺寸；例如 `4:5 + 2k` 会映射为 `1632x2048`。
- `--input-fidelity` 只在非 `gpt-image-2` 编辑任务中发送；`gpt-image-2` 默认高保真，脚本会自动忽略该参数。
- `IMG_API_KEY` 也可用 `OPENAI_API_KEY` 或 `API_KEY`。

### Google Gemini

```dotenv
IMG_PROVIDER=gemini
IMG_BASE_URL=https://generativelanguage.googleapis.com/v1beta
IMG_MODEL=gemini-3.1-flash-image
GEMINI_API_KEY=your-gemini-api-key
```

说明：

- Gemini 使用 `https://generativelanguage.googleapis.com/v1beta/interactions`。
- 鉴权头是 `x-goog-api-key`。
- 脚本会把 `--size` 写入 `response_format.aspect_ratio`，把 `--resolution` 写入 `response_format.image_size`。
- 参考图以内联 base64 图片块传入；多张参考图可重复使用 `--image`。
- 图片从响应里的 `output_image.data` 以及嵌套图片块中读取。
- `GEMINI_API_KEY` 也可用 `GOOGLE_API_KEY`、`GOOGLE_GENAI_API_KEY`、`IMG_API_KEY` 或 `API_KEY`。

### apimart.ai

```dotenv
IMG_PROVIDER=apimart
IMG_BASE_URL=https://api.apimart.ai/v1
IMG_MODEL=gpt-image-2
IMG_API_KEY=your-apimart-api-key
IMG_API_MODE=async
```

说明：

- 默认走异步轮询。
- 保留该方案是为了兼容已有 apimart 工作流。
- 新项目优先使用 `openai` 或 `gemini`。

## 自动判断规则

如果没有显式设置 `IMG_PROVIDER`：

1. `IMG_BASE_URL` 包含 `googleapis` 或 `generativelanguage`，使用 `gemini`。
2. `IMG_BASE_URL` 包含 `apimart`，使用 `apimart`。
3. 只有 Gemini Key 且没有 OpenAI Key，使用 `gemini`。
4. 其他情况默认使用 `openai`。

为了减少误判，生产环境建议始终写明：

```dotenv
IMG_PROVIDER=openai
```

或：

```dotenv
IMG_PROVIDER=gemini
```

## 命令示例

### OpenAI 纯文本生图

```bash
python3 scripts/generate_image.py \
  --provider openai \
  --prompt "clean ecommerce product hero image, #FFFFFF background, product occupies 38% of frame, at least 45% whitespace" \
  --size 1:1 \
  --resolution 2k \
  --output-dir generated-images/openai-demo
```

### OpenAI 参考图生图

```bash
python3 scripts/generate_image.py \
  --provider openai \
  --prompt-file prompts/H1-hero.txt \
  --image data/product.jpg \
  --size 1:1 \
  --output-dir generated-images/openai-product
```

### OpenAI 多参考图调试

```bash
python3 scripts/generate_image.py \
  --provider openai \
  --prompt-file prompts/H1-hero.txt \
  --image data/product-front.jpg \
  --image data/product-detail.jpg \
  --size 4:5 \
  --resolution 2k \
  --dry-run
```

### Gemini 纯文本生图

```bash
python3 scripts/generate_image.py \
  --provider gemini \
  --prompt-file prompts/social-01.txt \
  --size 4:5 \
  --resolution 2k \
  --output-dir generated-images/gemini-demo
```

### Gemini 参考图生图

```bash
python3 scripts/generate_image.py \
  --provider gemini \
  --prompt-file prompts/D1-intro.txt \
  --image data/product.jpg \
  --size 4:5 \
  --resolution 2k \
  --output-dir generated-images/gemini-product
```

### Gemini 参数调试

```bash
python3 scripts/generate_image.py \
  --provider gemini \
  --prompt-file prompts/social-01.txt \
  --size 16:9 \
  --resolution 2k \
  --dry-run
```

`--dry-run` 会打印脱敏后的请求摘要，不要求 API Key，也不会调用接口。

### 指定配置文件

```bash
python3 scripts/generate_image.py \
  --env-file /absolute/path/to/.env \
  --provider gemini \
  --prompt-file prompt.txt
```

## 参数速查

| 参数 | 说明 |
|---|---|
| `--provider` | 图片提供方：`openai`、`gemini`、`apimart`；也支持 `chatgpt`、`google` 等别名 |
| `--prompt` | 直接传入 Prompt |
| `--prompt-file` | 从文本文件读取 Prompt |
| `--image` | 参考产品图；可重复传入多张 |
| `--output-dir` | 图片输出目录，默认 `generated-images` |
| `--env-file` | 指定 `.env` 文件 |
| `--size` | 比例或尺寸，如 `1:1`、`4:5`、`1024x1024`、`auto` |
| `--resolution` | 目标清晰度：`1k`、`2k`、`4k` |
| `--quality` | OpenAI/兼容接口质量参数 |
| `--n` | OpenAI/兼容同步模式生成数量 |
| `--format` | 保存格式：`png`、`jpeg`、`webp` |
| `--input-fidelity` | OpenAI 参考图保真强度，`low` 或 `high`；`gpt-image-2` 会忽略 |
| `--dry-run` | 打印请求摘要，不调用 API，不要求 API Key |
| `--mode` | 仅 apimart 兼容模式使用：`sync` 或 `async` |
| `--poll-interval` | apimart 异步轮询间隔 |
| `--timeout` | apimart 异步轮询超时 |

## 尺寸处理

- OpenAI 模式：默认 `gpt-image-2` 会同时参考 `--size` 和 `--resolution`，并校验宽高不超过 `3840px`、宽高为 `16` 的倍数、长短边不超过 `3:1`、总像素在接口允许范围内。旧模型仍使用保守 1K 映射。
- Gemini 模式：如果传入比例，脚本会同时把比例写入 Prompt 技术要求和 `response_format.aspect_ratio`；清晰度写入 `response_format.image_size`。
- apimart 模式：异步接口使用比例格式，脚本会把常见像素尺寸转换为比例。

## 安全要求

- 不要把真实 `.env` 提交到仓库。
- 不要在 README、Prompt、日志或聊天记录中粘贴真实 API Key。
- 如果生成客户产品图，确认产品原图是否允许上传到第三方模型服务。
- 若要在公开仓库保存样图，先确认商品、品牌、模特和素材授权。
