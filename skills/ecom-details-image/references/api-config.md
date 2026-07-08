# API Configuration

`scripts/generate_image.py` supports OpenAI-compatible synchronous image APIs and apimart.ai-style asynchronous task polling.

## Environment

Create a local `.env` from `.env.example`:

```dotenv
IMG_BASE_URL=https://api.apimart.ai/v1
IMG_MODEL=gpt-image-2
IMG_API_KEY=your-api-key
```

Accepted aliases:

- `IMG_BASE_URL`, `OPENAI_BASE_URL`, `OPENAI_API_BASE`, `BASE_URL`
- `IMG_MODEL`, `OPENAI_IMAGE_MODEL`, `IMAGE_MODEL`, `OPENAI_MODEL`
- `IMG_API_KEY`, `OPENAI_API_KEY`, `API_KEY`

Optional:

- `IMG_API_MODE=sync` or `IMG_API_MODE=async`

CLI `--mode` overrides `IMG_API_MODE`. If neither is set, URLs containing `apimart` use async mode; all others use sync mode.

## Common Commands

Prompt only:

```bash
python3 scripts/generate_image.py \
  --prompt "clean ecommerce product hero image, #FFFFFF background, product occupies 38% of frame" \
  --size 1:1 \
  --resolution 2k
```

Prompt file plus reference product photo:

```bash
python3 scripts/generate_image.py \
  --prompt-file prompt.txt \
  --image product.jpg \
  --output-dir generated-images \
  --size 4:5 \
  --resolution 2k
```

Use `--env-file /path/to/.env` when running outside the skill directory.

## Notes

- Reference images are encoded as data URIs and sent in `image_urls`.
- Async mode converts common pixel sizes such as `1024x1024` to ratios such as `1:1`.
- Sync mode sends the `size` value unchanged to the provider.
- `--format` controls the output file extension; it does not transcode the image bytes.
- Generated images should not be committed unless they are intentionally curated examples.
