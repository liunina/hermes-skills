# Prompt Rules

Use these rules for ecommerce image prompts, especially PDP sets and conversion-oriented ads.

## Campaign Style Lock

For multi-image work, define one style lock and paste it unchanged into every prompt. Include:

- visual direction
- 2-3 main colors plus 1 accent color, with hex codes
- warm/cool/neutral temperature
- font style
- background system
- lighting system
- layout system
- icon/illustration style
- product angle and scale rules
- banned drift items

Example:

```text
Campaign Style Lock: premium clean ecommerce style; palette #FFFFFF background, #2D2D2D text, #D4AF37 accent; neutral 5500K lighting; modern geometric sans-serif typography; clean studio background; soft shadow below product; 45%+ whitespace; thin-line icons in #2D2D2D; no palette drift, mixed fonts, inconsistent lighting, random backgrounds, or mismatched icon styles.
```

## Concrete Constraints

Always prefer measurable constraints over vague adjectives:

- white background: `#FFFFFF`
- dark text: `#2D2D2D`
- gold accent: `#D4AF37`
- light beige background: `#F5F1E8`
- deep green background: `#1A3A2E`

Typical product occupancy:

| Image type | Product occupancy |
|---|---|
| white-background hero | 35-40% |
| benefit secondary image | 25-30% |
| lifestyle scene | 20-25% |
| feed ad | about 40% |
| search ad | about 45% |
| SKU/group card | 60-70% total |

Whitespace:

- hero, benefit, ad: at least 45%
- lifestyle: at least 50%
- vertical PDP module: 50%+

For domestic ecommerce main images, reserve overlay-safe regions when relevant:

- top-center 200x100 px empty region for price overlays
- upper-left 200x100 px empty region for logo or platform badges

## In-image Text

Use a 3-layer information hierarchy:

- main promise: 15 Chinese characters or fewer, or a short English headline
- 2-3 evidence points: icon + short label
- CTA: 8 Chinese characters or fewer, or a short button phrase

For Chinese text, wrap exact copy in Chinese corner quotes, for example `「轻薄透气」`. Avoid complex rare characters where possible.

## Negative Constraints

End every prompt with explicit exclusions. Avoid generic "no extra stuff"; name the banned items:

```text
Do not add: watermark, fake logo, extra products, hands, random props, cluttered background, gradient background, distorted text, unreadable labels, inconsistent product color.
```

For regulated categories, ban unsupported claims:

```text
Do not imply medical cure, guaranteed results, official certification, or platform endorsement.
```

## UGC / Social / Livestream Realism

When a realistic non-studio look is needed:

- specify a real phone camera, such as iPhone 14 Pro or iPhone 15 Pro
- add mild noise, warm color shift, imperfect framing, real countertop/room clutter
- use wording like `NOT professional photography`, `NOT retouched`, `NOT smoothed`
- avoid words such as perfect, flawless, stunning, hyper-realistic
- mention natural skin texture, visible pores, small shadows, and ordinary environment details when humans are present

## Prompt Shape

Default prompt structure:

1. Campaign Style Lock, if multi-image
2. subject and scene
3. commercial purpose and emotional intent
4. composition, lens, angle, crop
5. lighting, color, material, texture
6. realism/style level
7. platform aspect ratio and safe zones
8. in-image text rules
9. negative constraints

Keep prompts specific but not overloaded. Do not combine multiple unrelated scenes in one prompt.
