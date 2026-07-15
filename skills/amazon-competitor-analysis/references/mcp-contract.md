# MCP Contract: Amazon Competitor Analysis

## Skill

- Skill ID: `amazon-competitor-analysis`
- Registry file: `workflow-registry/amazon-competitor-analysis.json`
- MCP manager: `workflow-dinve-skills`
- Primary MCP call: `run_workflow_skill`

## Transport

The skill is executed through a private n8n webhook wrapper. The webhook URL can be provided through:

- Private repo fixed config: `transport.url` in `workflow-registry/amazon-competitor-analysis.json`
- Environment variable: `AMAZON_COMPETITOR_WEBHOOK_URL`
- Local secret file: `secrets/amazon-competitor-analysis.webhook-url.txt`

Do not commit API keys, bot tokens, or n8n credential values.

## v2 Production Architecture

The production transport points to the v2 wrapper. The legacy wrapper remains registered only as rollback. v2 keeps a single main entrypoint while splitting the heavy work internally:

1. **Webhook wrapper v2** validates input and chooses sync/async mode. Recommended mode is `hybrid`, which defaults to async unless `mode: "sync"` is explicitly requested.
2. **Orchestrator v2** creates a `runId`, records the run, dispatches the owned Listing plus competitor items concurrently, polls item rows until completion or timeout, aggregates results, and optionally publishes the final Wiki report. The owned Listing is an extra completion-ledger row and is not counted as a competitor.
3. **Single-item subworkflow v2** analyzes either one owned Listing (`itemRole: own`) or one competitor (`itemRole: competitor`), writes strict structured JSON to the item Data Table, optionally publishes a Wiki child page, and returns compact status.
4. **Review / Q&A mining** uses real Review samples, rating distribution, answered-question metadata, and Q&A text when present in the Decodo response. Missing Q&A text must be marked `unavailable` or `metadata_only`; the workflow must not invent questions, answers, review counts, or frequencies.
5. **Final report generation** aggregates the compact item JSON into a professional long-form Wiki report. It includes an owned-Listing baseline, field-by-field owned-vs-competitor gaps, real Review/Q&A sample themes and evidence limits, quick conclusions, competitor matrix, price/spec bands, selling-point patterns, image/A+ funnel, keyword/title formula, compliance risks, Listing rewrite suggestions, and P0/P1/P2 action plan.
6. **HTML / MinIO publishing** optionally converts the final report and structured input into a responsive visual HTML report, downloads selected Listing/A+ images, stores shared CSS and JSON artifacts, and preserves an immutable snapshot per `runId`.
7. **Query run v2** is a read-only status endpoint that accepts `runId` and returns the run row, item rows, failure reasons, Wiki links, HTML links, and artifact status.

The current v3 implementation adds three persistent cache layers without changing the public v2 wrapper:

1. **Decodo Listing cache** stores normalized Listing, Review/Q&A evidence, fetch status, stale window, and failure details.
2. **Gemini image cache** stores strict per-image visual JSON keyed by normalized image URL and the active model/prompt/schema versions.
3. **Final item-analysis cache** stores the strict business JSON keyed by Listing hash, visual hash, prompt/model/locale/schema, so an input or prompt change naturally invalidates the old result.

The first invalid final-model response may be retried with a compact strict-JSON prompt. This retry branch starts after Listing and visual analysis; it must not reconnect to Decodo or Gemini.

Data Table persistence:

- Run table: `amazon_competitor_analysis_runs`, unique key `runId`.
- Item table: `amazon_competitor_analysis_items`, unique key `runId / ownAsin / competitorAsin`.
- Listing cache: `amazon_listing_fetch_cache`, unique key `cacheKey`.
- Image cache: `amazon_image_analysis_cache`, unique key `cacheKey`.
- Final-analysis cache: `amazon_item_analysis_cache`, unique key `analysisCacheKey`.
- Re-running the same competitor for the same run updates the row instead of appending duplicates.

Cache maintenance:

- Workflow: `[维护] Clean Amazon competitor analysis caches` (`No8aaxrkygAUeokt`).
- Schedule: every day at 03:30, timezone `Asia/Tokyo`.
- Listing deletion condition: `staleUntil < now`.
- Final-analysis deletion condition: `expiresAt < now - 48h`.
- Image deletion condition: `expiresAt < now - 7d`.
- Invoked calls default to `dryRun: true`. Real deletion requires both `dryRun: false` and `confirmDelete: true`.

Wiki path convention:

- Final report: `home/areas/ecommerce/amazon/competitor-analysis/{ownAsin}`.
- Item page: `home/areas/ecommerce/amazon/competitor-analysis/{ownAsin}/items/{competitorAsin}`.
- Owned Listing page: `home/areas/ecommerce/amazon/competitor-analysis/{ownAsin}/own-listing`.

MinIO object convention:

- Bucket: `amazon-reports`.
- Latest HTML: `amazon/competitor-analysis/{ownAsin}/index.html`.
- Run snapshot: `amazon/competitor-analysis/{ownAsin}/runs/{runId}/index.html`.
- Run metadata: `amazon/competitor-analysis/{ownAsin}/runs/{runId}/manifest.json` and `report-data.json`.
- Cached report images: `amazon/competitor-analysis/{ownAsin}/runs/{runId}/assets/images/`.
- Shared v1 CSS: `amazon/competitor-analysis/_assets/css/report-v1.css`.
- Shared v2 assets: `amazon/competitor-analysis/_assets/report-v2/css/report-v2.css`, `js/report-v2.js`, `icons/report-icons.svg`, and Inter font files.
- Standard URL base: `https://data.dinve.com/amazon-reports`. The shorter `https://data.dinve.com/amazon/competitor-analysis/...` form is valid only after a reverse proxy hides the bucket name.
- Object upload success does not make a private bucket public. Delivery requires anonymous read-only access for the object prefix or an authenticated/reverse-proxy layer; never allow anonymous writes.

Read-only query endpoint:

- Workflow: `[工具] Query Amazon competitor analysis run v2`
- Input: `{ "runId": "acr_..." }`
- Output: run status, counts, final Wiki link/path, item rows, per-item Wiki links, and `failedItems`.

## Input Fields

```json
{
  "competitorUrls": ["https://www.amazon.co.jp/dp/B0CW5YZG67"],
  "competitorText": "",
  "ownProductUrl": "",
  "ownAsin": "",
  "analyzeOwnListing": true,
  "productIdea": "",
  "targetAudience": "",
  "marketplace": "amazon.co.jp",
  "locale": "zh-CN",
  "focus": "价格带、卖点、主图吸引点击、功能图讲清卖点、细节图降低疑虑、A+页面、关键词、切入策略",
  "maxCompetitors": 8,
  "mode": "hybrid",
  "syncWaitSeconds": 120,
  "cacheMode": "prefer_cache",
  "decodoCacheTtlHours": 24,
  "visualCacheTtlHours": 720,
  "analysisCacheTtlHours": 24,
  "allowStaleOnError": true,
  "staleMaxAgeHours": 168,
  "dryRun": true,
  "publishWiki": false,
  "publishItemWiki": false,
  "publishHtml": false,
  "htmlEndpointBaseUrl": "https://data.dinve.com",
  "htmlS3Bucket": "amazon-reports",
  "htmlS3Prefix": "amazon/competitor-analysis",
  "htmlPublicBaseUrl": "https://data.dinve.com/amazon-reports",
  "htmlShortBaseUrl": "https://data.dinve.com",
  "htmlUseShortUrl": true,
  "htmlStyleVersion": "v1",
  "htmlMaxProductImages": 5,
  "htmlMaxAplusImages": 4,
  "notifyMattermost": false,
  "wikiPath": "",
  "wikiPathPrefix": "home/areas/ecommerce/amazon/competitor-analysis",
  "mattermostChannelId": "",
  "mattermostBaseUrl": ""
}
```

## Field Rules

- `competitorUrls`: Use normalized Amazon product URLs when available.
- `competitorText`: Use raw ASINs, messy links, pasted notes, or multi-line inputs.
- `ownProductUrl` / `ownAsin`: Optional. Leave empty for market opportunity analysis without an owned product.
- `analyzeOwnListing`: Defaults to `true` when an owned ASIN/URL is supplied. The owned row uses `competitorAsin = ownAsin` for the existing unique key and stores `itemRole: own` inside `analysisJson_object`.
- `productIdea` / `targetAudience`: Optional. The workflow may infer them.
- `marketplace`: Amazon marketplace domain, such as `amazon.co.jp` or `amazon.com`.
- `locale`: Default report language, usually `zh-CN`.
- `maxCompetitors`: Default is 8 for normal production use; start with 1 for debugging or high-cost validation.
- `mode`: v2 supports `sync`, `async`, and `hybrid`. Recommended default is `hybrid`; current wrapper treats hybrid as async unless `mode: "sync"` is explicitly requested.
- `syncWaitSeconds`: Upper wait budget for sync/hybrid callers. Keep it below the upstream caller timeout.
- `cacheMode`: One of `prefer_cache`, `refresh`, `cache_only`, or `bypass`.
  - `prefer_cache`: Read fresh positive/negative entries, fetch misses, write refreshed results, and allow Listing stale fallback on a live Decodo error.
  - `refresh`: Skip cache reads, call live services, and update caches.
  - `cache_only`: Never call Decodo, Gemini, or the final analysis model; return explicit misses for unavailable layers.
  - `bypass`: Skip all cache reads and writes, but call live services.
- `decodoCacheTtlHours`: Positive Listing TTL. Default 24; bounded to 1–168 hours.
- `visualCacheTtlHours`: Positive Gemini per-image TTL. Default 720; bounded to 1–8760 hours.
- `analysisCacheTtlHours`: Positive final strict-JSON TTL. Default 24; bounded to 0.25–168 hours.
- `allowStaleOnError`: Default `true`. When a live Listing fetch fails, a still-usable stale normalized Listing may be returned with decision `stale_fallback`.
- `staleMaxAgeHours`: Default 168; bounded to 1–720 hours.
- `dryRun`: Skips Wiki, HTML/MinIO, and Mattermost publishing, but may still call AI and scraping services inside the workflow.
- `publishWiki`: Side effect. Requires `confirmSideEffects: true`.
- `publishItemWiki`: Side effect. Requires `confirmSideEffects: true`. In v2, publishes/updates one child page per competitor.
- `publishHtml`: Side effect. Requires `confirmSideEffects: true`. When the user asks to publish the final Wiki report, callers should normally set both `publishWiki: true` and `publishHtml: true` unless the user opts out of HTML.
- `htmlS3Prefix`: Default `amazon/competitor-analysis`; trim leading/trailing slashes and keep other Amazon business artifacts under separate prefixes.
- `htmlPublicBaseUrl`: Default `https://data.dinve.com/amazon-reports`, including the bucket name required by the current MinIO endpoint.
- `htmlUseShortUrl`: Default `true` after the production reverse proxy was verified on 2026-07-15. Set false only when diagnosing the native bucket-backed object URL.
- `htmlMaxProductImages` / `htmlMaxAplusImages`: Per-ASIN report image limits, bounded to 0–8. Defaults are 5 product images and 4 A+ images, plus one main image.
- `notifyMattermost`: Side effect. Requires `confirmSideEffects: true`.
- `wikiPathPrefix`: v2 default is `home/areas/ecommerce/amazon/competitor-analysis`.

## v2 Strict Item JSON

Each owned or competitor item should be stored as compact JSON, not long prose. Required analysis areas:

- price and price evidence
- rating and review count
- title, brand, core selling points
- image count, A+ image count, video presence, and image/A+ observations
- `listing.mainImageUrl`, `listing.images`, `listing.aplusImages`, and `listing.assetCompleteness`
- opportunity points
- risk points
- keywords and search terms
- positioning summary
- source/evidence notes
- `itemRole: own|competitor`
- `reviewMining`: status, sample size, rating distribution, positive/negative themes, purchase barriers, usage problems, expectation gaps, frequent questions, Listing fixes, product fixes, and evidence notes

Review evidence rules:

- Theme `evidenceCount` cannot exceed the Review sample size.
- When Review text is missing, set `reviewMining.status: unavailable` and leave actual Review theme arrays empty.
- When only answered-question count is available without Q&A text, set Q&A status to `metadata_only` or `unavailable` and do not synthesize questions.
- Category-level inferences must be separated from observed Review/Q&A findings and explicitly labeled as inference.

Failed competitors must still be upserted with `status: failed`, `errorType`, and `errorMessage`, then included in the final report's `失败/待补抓` section.

`assetCompleteness` is the source of truth for report wording around visual assets:

- `imageStatus`, `aplusStatus`, and `videoStatus` use `present`, `absent`, `partial`, `unknown_fetch_failed`, or `unknown_not_supported`.
- `unknown_*` means the workflow cannot prove presence or absence from the current data source. Main reports must say “数据源未返回/待确认” or equivalent, not “没有”.
- `dataCompletenessScore` and `warnings` may be used to explain evidence limits without adding new Data Table columns.
- Decodo may return A+ module image URLs inside the generic `description` field instead of a dedicated A+ field. When `description` contains image URLs matching `aplus-media-library-service-media` or `/aplus-media/`, normalize them into `listing.aplusImages`, set `aplusStatus: present`, and include up to 4 of those images in the Gemini visual-analysis input.
- Decodo's `has_videos` field is video metadata and must be normalized alongside `videos`, `video`, `has_video`, and `hasVideo`. A returned `false` should produce `videoStatus: absent`; only a missing/unsupported source should produce `unknown_not_supported`.

Cache observability must be preserved inside each item's `analysisJson_object.cache`:

- `mode`
- Listing cache `hit`, `decision`, and failure metadata when applicable
- Gemini `cacheHitCount` and live `requestedCount`
- final-analysis `hit`, `decision`, and `source` (`cache` or `openai`)

Negative-cache defaults prevent repeated failing calls while keeping recovery reasonably fast:

- transient Decodo errors: 10 minutes
- non-transient Decodo errors: 24 hours
- Gemini errors: error-specific reuse window, normally 15 minutes to 6 hours
- final-analysis generation/JSON error: 2 minutes

## v3.1 Professional Final Report

The compact-output rule applies to single-competitor item rows, not to the final Wiki page. The final report should be detailed enough for business decisions and Listing revision work while remaining deterministic and bounded.

The current v3.1 renderer is deterministic JavaScript over structured item JSON. It renders main images in the Markdown/Wiki report, keeps per-image Gemini/OCR details out of the main report, and blocks Wiki publish when `reportQa.passed` is false.

Required final report sections:

- `0. 快速结论`
- `1. 数据完整性与抓取说明`
- `2. 我方 Listing 基线`
- `3. 竞品池概览`
- `4. 价格带、规格带与定位`
- `5. 目标人群与使用场景`
- `6. 高转化卖点共性与差异化机会`
- `7. 图片 / A+ / 视频转化漏斗`
- `8. Review / Q&A 真实痛点挖掘`
- `9. 合规与经营风险`
- `10. Listing 改版方向`
- `11. P0 / P1 / P2 执行清单`
- `12. 失败 / 待补抓`
- `13. 数据与方法说明`

The final report may be generated from structured item JSON and Listing metadata instead of asking a model to produce one very large answer. This preserves detail while reducing output-limit and truncation risk.

Quality rules:

- Main language is Simplified Chinese; Japanese original Listing/Review evidence should be quoted with `“”`.
- Target audience and usage scenarios must remain separate.
- Title suggestions must mention the Japan Amazon 75-character rule.
- `reportQa.blockingIssues` must be empty before Wiki publish. Dry-run and QA-blocked reports skip publish even if `publishWiki` is true upstream.

## v2 Parallelization and Completion Tracking

- Single-competitor jobs are dispatched with `Execute Workflow` using `mode: "each"` and `options.waitForSubWorkflow: false`.
- The orchestrator uses `amazon_competitor_analysis_items` as the completion ledger. It polls rows by `runId` and waits until every expected competitor has a terminal `status` of `success` or `failed`.
- The default orchestration timeout is 600 seconds. Any non-terminal or missing item after timeout is upserted as `status: failed`, `errorType: timeout_or_incomplete`, and is listed in `失败/待补抓`.
- Because the public wrapper returns `202` for every mode except explicit `mode: "sync"`, callers should normally poll the query endpoint by `runId` instead of waiting on the initial request.

## Expected Output Fields

- `ok`: Overall success boolean.
- `httpStatus`: Webhook HTTP status.
- `title`: Report title.
- `report` / `output`: Markdown report.
- `wikiLink`: Wiki.js page URL when published.
- `htmlReportUrl`: Latest visual HTML report URL when uploaded successfully.
- `htmlArchiveUrl`: Immutable run-specific visual HTML report URL.
- `htmlPublishStatus`: `disabled`, `success`, `partial_success`, or `failed`.
- `htmlPublishError`: Aggregated per-artifact upload failure reason.
- `artifacts`: CSS/HTML/JSON object list with S3 keys, public URLs, hashes, statuses, and error messages.
- `htmlStyleVersion`: `v1` for the legacy report or `v2` for the dashboard/evidence-wall report. v2 keeps all CSS, JavaScript, icons, and fonts in the MinIO asset prefix.
- `runId`: v2 run identifier for polling, dedupe, and troubleshooting.
- `accepted`: For async v2 calls, `true` means the run was accepted and continues in the background.
- `queryHint`: For async v2 calls, includes the `runId` to poll through the query workflow.
- `status`: v2 run status, such as `running`, `success`, `partial_success`, or `failed`.
- `competitorCount`: Number of competitor listings analyzed.
- `successCount`: Number of successful competitor item analyses.
- `failedCount`: Number of failed competitor fetches.
- `failedItems`: Failed competitors with failure reasons.
- `itemResults`: Compact per-competitor structured results when returned synchronously or by the orchestrator.
- `itemWikiLinks`: Per-competitor Wiki child page links when published.
- `publishStatus`: Wiki publishing status.
- `notificationStatus`: Mattermost notification status.
- `competitorMatrix`: Structured comparison data.
- `imageStrategyAnalysis`: Image-strategy evidence, Gemini per-image visual status, cache-hit/request counts, failed-image list, and evidence limitations. The v2 HTML report additionally exposes this data as the “图片与 A+ 证据墙”, with a single-row horizontal gallery, competitor reference/borrowing summaries, and image-level scores. Expanded image details are separated into OCR, visible elements/claims, and visual recommendations; missing/failed Gemini results remain explicitly marked as unavailable evidence.
- `decisionSummary`: Executive decision summary for report-v2, including the one-line competitive headline, measurable market signals, and data-quality context.
- `opportunityItems`: Deduplicated structured opportunity items with text, priority, evidence, action, confidence, source, ASIN attribution, and merged ASIN/source lists. The HTML report shows Top 3 first and keeps the remaining items behind “查看全部”。
- `riskItems`: Deduplicated structured risk items with the same evidence and priority fields as `opportunityItems`; compliance/claim risks are conservatively promoted to `P0` when no explicit priority is supplied.
- `actionItems`: Structured execution items grouped in the HTML report into `P0`/`P1`/`P2`/`待确认` buckets. Each item links back to the relevant evidence section when its source indicates imagery, A+, visual analysis, Review, or pain points.
- `reportQa`: Final-report QA result with `passed`, `blockingIssues`, `warnings`, `checkedAt`, and `version`.
- `wikiPublish`: Raw Wiki component result.
- `mattermostNotify`: Raw Mattermost component result.

## Safe Smoke Test

Use a side-effect input without confirmation:

```json
{
  "skillId": "amazon-competitor-analysis",
  "input": {
    "publishWiki": true
  }
}
```

Expected result:

```json
{
  "ok": false,
  "error": "side_effect_confirmation_required"
}
```

This verifies the MCP guard without calling the webhook.
