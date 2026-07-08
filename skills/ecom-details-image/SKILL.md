---
name: ecom-details-image
description: Create conversion-oriented ecommerce image briefs, product hero/PDP/social/ad prompts, and optionally generate images with an OpenAI-compatible image API. Use for product image strategy, Campaign Style Lock, Amazon/Shopify/TikTok Shop detail pages, social creatives, UGC/live-stream scenes, virtual try-on, flat lays, detail macro shots, packaging, infographics, or direct prompt-to-image generation from product references.
metadata:
  hermes:
    version: 1.0.0
    author: liunina
    tags: [ecommerce, image-generation, product-photography, prompt, ads, pdp]
    category: ecommerce
    platforms: [linux, macos]
---

# E-commerce Details Image

Use this skill to plan and generate ecommerce visual assets. The skill supports two modes:

- **Brief / Prompt mode**: produce a visual brief, conversion diagnosis, Campaign Style Lock, and final image prompts.
- **Generate mode**: when the user explicitly asks to generate/render images, write prompt files and call `scripts/generate_image.py`.

Never ask for, print, commit, or echo real API keys. If image generation is requested but API config is missing, return the prompts and explain the required `.env` variables.

## Core Workflow

1. Identify the product, target platform, image use case, audience, product category, aspect ratio, text requirements, and negative constraints.
2. Match the request to one or more templates under `references/templates/`. Read only the relevant template files.
3. For ecommerce product, ad, PDP, or campaign work, diagnose the dominant conversion driver:
   - visual desirability
   - pain-point removal
   - emotional/status value
   - trust/proof
4. For any multi-image output, define a **Campaign Style Lock** before writing individual prompts. Reuse the exact same lock in every prompt.
5. Write concise, executable image prompts. Use English by default unless the user requests another language.
6. Include concrete numeric constraints for product scale, whitespace, palette hex codes, platform overlay-safe areas, and in-image text.
7. If direct generation is requested, call `scripts/generate_image.py`; pass `--image` when the user provides a product reference photo.
8. Return generated paths, final prompts, assumptions, and any missing configuration.

## Template Selection

Use this map to choose templates:

| Request | Template |
|---|---|
| hero, main image, white background, packshot | `01-hero-image.json` |
| lifestyle, scene, room, outdoor use | `02-lifestyle-scene.json` |
| flat lay, top-down, arrangement | `03-flat-lay.json` |
| detail, macro, texture, material | `04-detail-macro.json` |
| poster, banner, promotion, sale | `05-poster-banner.json` |
| social, Instagram, TikTok, Xiaohongshu, X/Twitter | `06-social-media.json` |
| UGC, buyer show, review style, phone photo | `07-ugc-style.json` |
| model, apparel on body, fashion model | `08-model-showcase.json` |
| before/after, comparison, result | `09-before-after.json` |
| packaging, box, unboxing, gift set | `10-packaging.json` |
| infographic, A+ content, PDP detail module | `11-infographic.json` |
| creative concept, brand visual, surreal ad | `12-creative-concept.json` |
| size, specs, usage steps | `13-size-spec.json` |
| bundle, kit, multiple products | `14-multi-product.json` |
| livestream, live commerce, host scene | `15-livestream.json` |
| virtual try-on, inserted into real scene | `16-try-on-virtual.json` |
| exploded view, structure, components | `17-exploded-view.json` |
| ghost mannequin, invisible model | `18-ghost-mannequin.json` |
| grid, multi-angle, 360 view | `19-multi-angle-grid.json` |
| magazine, editorial, cover | `20-magazine-editorial.json` |
| seasonal campaign, holiday, four seasons | `21-seasonal-campaign.json` |
| luxury, premium atmosphere, smoke, reflection | `22-luxury-atmospherics.json` |
| device mockup, app screen, SaaS | `23-device-mockup.json` |
| storefront, retail display, shelf | `24-storefront.json` |
| sports, fitness, outdoor active campaign | `25-sports-campaign.json` |

If nothing matches, start from `01-hero-image.json` and adapt.

## PDP Defaults

When the user asks for a full ecommerce detail page, Amazon PDP, Shopify product page, A+ content, or a complete product image set, plan:

- 5 square hero/main images
- 7-9 vertical detail images
- one shared Campaign Style Lock
- a conversion sequence from first-click clarity to trust and CTA

Use these default modules unless the product needs a different sequence:

- H1: hero claim and product recognition
- H2: material or core function close-up
- H3: lifestyle scene
- H4: comparison or before/after
- H5: offer, trust, logistics, or CTA
- D1: who it is for and what problem it solves
- D2: pain point
- D3: mechanism or structure
- D4: 2-4 key benefits
- D5: usage steps
- D6: scenarios
- D7: comparison
- D8: trust proof
- D9: FAQ, risk reversal, or CTA

## Prompt Rules

Before writing final prompts, read `references/prompt-rules.md` when the task involves ecommerce conversion, UGC/social realism, in-image text, PDP packs, or multi-image consistency.

For direct API generation, read `references/api-config.md` if configuration, provider mode, image reference handling, or CLI flags matter.

## Generation

Examples:

```bash
python3 scripts/generate_image.py \
  --prompt "clean product hero image, #FFFFFF background, product occupies 38% of frame" \
  --size 1:1 \
  --resolution 2k
```

```bash
python3 scripts/generate_image.py \
  --prompt-file prompt.txt \
  --image product.jpg \
  --output-dir generated-images \
  --size 4:5 \
  --resolution 2k
```

Use `.env.example` as the configuration template. Put the real `.env` outside version control.

## Attribution

This skill is adapted from `liangdabiao/ecom-details-image` and reorganized for the `hermes-skills` tap. The upstream repository did not declare a license at the time this skill was added; review licensing before redistributing or merging into production distributions.
