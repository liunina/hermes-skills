---
name: amazon-competitor-analysis
description: Analyze Amazon competitors through a registered n8n workflow skill. Use when the user asks to compare Amazon ASINs, product links, market positioning, price bands, review patterns, listing opportunities, image strategy, keywords, A+ page gaps, or publish a competitor report to Wiki.js and optionally notify Mattermost.
metadata:
  hermes:
    version: 0.3.0
    author: liunina
    tags: [amazon, competitor, listing, ecommerce, n8n, workflow]
    category: ecommerce
---

# Amazon Competitor Analysis

Use the `workflow-dinve-skills` MCP manager instead of recreating competitor analysis logic in the agent.

For the full input/output contract, read `references/mcp-contract.md`.
For trigger regression examples, read `../../docs/evals/amazon-competitor-analysis.md`.

## Invocation

1. Call `get_workflow_skill` with `skillId: "amazon-competitor-analysis"` before the first run in a session.
2. Call `run_workflow_skill` with `skillId: "amazon-competitor-analysis"` and the structured input.
3. Keep `dryRun: true`, `publishWiki: false`, and `notifyMattermost: false` for first runs or debugging.
4. Only set `publishWiki: true` or `notifyMattermost: true` when the user explicitly asks for those side effects. Also pass `confirmSideEffects: true`.

## v2 Workflow

The registry uses the v2 architecture for larger batches and normal production calls. The legacy wrapper remains available only as rollback.

- Keep one user-facing entrypoint.
- Use `mode: "hybrid"` by default. The current wrapper treats hybrid as async unless `mode: "sync"` is explicitly requested, so callers should expect a fast `202` response with a `runId` and then poll/query by `runId`.
- Store every competitor result in `amazon_competitor_analysis_items` with the unique key `runId / ownAsin / competitorAsin`.
- When `ownAsin` / `ownProductUrl` is present, analyze the owned Listing through the same single-item subworkflow by default (`analyzeOwnListing: true`). Store it in the same item table with `competitorAsin = ownAsin` and `itemRole: "own"` inside `analysisJson_object`, but do not include it in `competitorCount`.
- Store run-level state in `amazon_competitor_analysis_runs` with the unique key `runId`.
- The orchestrator dispatches single-competitor jobs with `Execute Workflow` in `mode: "each"` and `waitForSubWorkflow: false`, then polls `amazon_competitor_analysis_items` until all rows are terminal or the orchestration timeout is reached.
- Keep single-item outputs compact and strict JSON, including evidence-bounded `reviewMining`. Use real Review samples, rating distribution, and Q&A text returned by Decodo; when Q&A text is unavailable, mark it unavailable/metadata-only and never invent questions. Make the final Wiki report a professional long-form report with owned-Listing baseline, field-by-field gaps, real Review/Q&A pain themes, market conclusion, competitor matrix, price/spec band, selling-point patterns, image/A+ funnel, keyword/title formula, compliance risks, Listing rewrite suggestions, and P0/P1/P2 action plan.
- Use `[工具] Query Amazon competitor analysis run v2` / the query endpoint to read run status, item rows, failure reasons, and Wiki links by `runId`.
- Publish the final report to `home/areas/ecommerce/amazon/competitor-analysis/{ownAsin}` when `publishWiki` is explicitly confirmed.
- Publish per-competitor child pages to `home/areas/ecommerce/amazon/competitor-analysis/{ownAsin}/items/{competitorAsin}` when `publishItemWiki` is explicitly confirmed.
- Publish the owned Listing baseline child page to `home/areas/ecommerce/amazon/competitor-analysis/{ownAsin}/own-listing` when `publishItemWiki` is explicitly confirmed.
- If one competitor fails or times out, continue the run, save the failure reason, and include it in `失败/待补抓`.

## v3 Three-Layer Cache

The v2 workflow topology now uses a v3 cache policy so repeated batches do not repeatedly spend Decodo, Gemini, and final-analysis tokens on unchanged inputs.

- `prefer_cache` is the production default: reuse fresh positive or negative cache entries, fetch misses, and allow a usable stale Listing fallback when Decodo fails.
- `refresh` skips reads and regenerates each layer, then updates cache rows.
- `cache_only` never calls Decodo, Gemini, or the final analysis model. Missing layers return explicit cache-miss failures.
- `bypass` skips both cache reads and cache writes while still calling live services.
- Default positive TTLs are 24 hours for Decodo Listing data, 720 hours for Gemini per-image visual analysis, and 24 hours for final strict JSON analysis.
- Listing stale fallback is enabled by default for up to 168 hours through `allowStaleOnError` and `staleMaxAgeHours`.
- Negative cache entries are intentionally shorter: transient Listing failures use 10 minutes, non-transient Listing failures use 24 hours, Gemini failures use error-specific TTLs from 15 minutes to 6 hours by default, and final-analysis failures use 2 minutes.
- Cache keys are deterministic: Listing uses marketplace/ASIN/geo/operation/schema; images use normalized image URL plus model/prompt/schema; final analysis uses marketplace/ASIN plus Listing hash, visual hash, prompt/model/locale/schema.
- If the first final-analysis response is `invalid_json`, retry only the final AI step with a compact prompt. Do not repeat Decodo or Gemini.
- Per-item `analysisJson_object.cache` records cache mode, Listing decision, Gemini hit/request counts, final-analysis decision, and whether the final result came from cache or OpenAI.
- Maintenance workflow `[维护] Clean Amazon competitor analysis caches` runs daily at 03:30 in `Asia/Tokyo`. Manual/subworkflow calls default to dry-run and require both `dryRun: false` and `confirmDelete: true` for deletion.

## v3.1 Report Quality Renderer

The v2 topology now uses a v3.1 deterministic final-report renderer on top of the v3 cache layers.

- Final Wiki reports render product main images directly in the owned baseline and competitor overview using inline image tags. Per-item child pages render a larger main image above the structured JSON.
- Single-item rows store `listing.mainImageUrl`, `listing.images`, `listing.aplusImages`, and `listing.assetCompleteness` inside `analysisJson_object`; no extra Data Table columns are required.
- `assetCompleteness` distinguishes `present`, `absent`, `partial`, `unknown_fetch_failed`, and `unknown_not_supported`. Do not rewrite `unknown_*` as “not found”.
- For Decodo Amazon Listing responses, treat `description` images whose URL contains `aplus-media-library-service-media` or `/aplus-media/` as A+ image evidence when dedicated `aplus` / `a_plus` / `aplus_content` / `enhanced_brand_content` fields are missing. In that case set `aplusStatus: "present"`, preserve the URLs in `listing.aplusImages`, and send up to 4 of them to Gemini.
- Recognize Decodo's `has_videos` field as video evidence metadata. A returned `false` means video status can be `absent`; a missing video field remains `unknown_not_supported`.
- The main report is business-readable Chinese. Japanese source text may be quoted as evidence, but should be wrapped in `“”` and not mixed into Chinese explanatory sentences.
- Target audience and usage scenarios must be separate report subsections.
- Main reports summarize image/A+/video strategy only. Per-image OCR/Gemini details stay in child pages and Data Table JSON.
- Title suggestions must mention the Japan Amazon 75-character constraint and flag over-length candidates.
- Final Wiki publishing is gated by `reportQa.passed`; dry-runs and QA-blocked reports must not publish.
- The renderer safely rewrites unknown-sensitive phrases such as “无视频证据” into “当前抓取未返回视频证据” when A+/video status is unknown.

## Defaults

- If the user has no owned ASIN, leave `ownAsin` and `ownProductUrl` empty.
- Default `analyzeOwnListing` to `true` when an owned ASIN/URL is supplied. Set it to `false` only when the caller explicitly wants competitor-only analysis.
- If the user omits `productIdea` or `targetAudience`, leave them empty and let the workflow infer context.
- Use `competitorText` for raw ASINs, messy links, copied notes, or multi-line user input.
- Use `competitorUrls` for normalized Amazon product URLs.
- Default `maxCompetitors` is 8 for normal production use. Start with `1` only for debugging or cost-sensitive validation.
- Prefer `mode: "hybrid"` and use `runId` to track async runs.
- Default `cacheMode` to `prefer_cache`; use `refresh` only for an intentional refetch, `cache_only` for zero-external-call diagnostics, and `bypass` for live diagnostics that must not read or write cache.
- Image recommendations follow a fixed conversion framework: the main image attracts clicks, feature images explain selling points, and detail images reduce buyer doubts.
- The single-item workflow sends up to 8 product images and 4 A+ images to Gemini for pixel-bounded, per-image visual analysis. Treat failed images as unavailable evidence and never infer invisible content from the URL or filename.
- Use `reportQa` to decide whether a generated final report is publishable. If `reportQa.passed` is false, inspect `blockingIssues`, fix the workflow/report data, and rerun before enabling Wiki publish.

## Input Example

```json
{
  "skillId": "amazon-competitor-analysis",
  "input": {
    "competitorText": "B0CW5YZG67",
    "marketplace": "amazon.co.jp",
    "locale": "zh-CN",
    "maxCompetitors": 1,
    "dryRun": true,
    "publishWiki": false,
    "notifyMattermost": false
  }
}
```

## Side Effects

These fields trigger side effects and require explicit user approval:

- `publishWiki`: publish or update a Wiki.js report.
- `publishItemWiki`: publish or update per-competitor Wiki child pages in the v2 candidate workflow.
- `notifyMattermost`: send a Mattermost notification.

The MCP manager must reject these fields unless `confirmSideEffects: true` is supplied.

## Output

Return business-useful fields first:

1. Report title and short conclusion.
2. Wiki link when published.
3. Number of competitors analyzed and failures.
4. Mattermost notification status when requested.
5. Image strategy status and its evidence limitations.
6. Operational warnings such as AI timeout, Decodo failure, Wiki publish failure, or Mattermost credential failure.

Never print API keys, bot tokens, or credential values.
