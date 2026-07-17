# Amazon Listing Audit v2 Contract

## Production Workflows

| Role | Workflow | ID |
|---|---|---|
| Listing fetch/cache | `[子工作流] Fetch Amazon listing with cache v2` | `7Jkzc6YUcp7MFP8S` |
| Private report gateway | `[入口] Serve private Amazon listing audit HTML report` | `u7Ty8iIscmgBG0PJ` |
| HTML publisher | `[子工作流] Publish Amazon listing audit HTML report` | `TGRnG2jrfjaVr880` |
| Background worker | `[工具] Run Amazon listing audit worker v2` | `Dcj1rzbjmEQLCrZe` |
| Async start | `[工具] Start Amazon listing audit v2` | `gXgnugJabJmfitIy` |
| Run query | `[工具] Query Amazon listing audit run v2` | `wftxqUn5bFMhl2AB` |
| Authenticated wrapper | `[MCP入口] Amazon listing audit webhook v2` | `b3wfkzCN17xlv0Ed` |

The original legacy record (`YKKggk6QZLyI2dk9`) is retired. Its sanitized recovery snapshot is soft-archived as `AmzonListingAdapt` (`6gwIlusLe2WDyVGR`) and is not a valid production entrypoint.

## Architecture

```text
start or authenticated webhook
  -> deterministic input validation
  -> queued run row
  -> fire-and-forget worker
      -> Listing fetch/cache
      -> Gemini image analysis/cache
      -> strict OpenAI audit JSON and one compact retry
      -> responsive HTML + JSON artifacts in private MinIO
      -> private report gateway verification
      -> final run row
      -> optional Mattermost completion notification

query
  -> runId lookup
  -> structured status, error, audit, Listing, and report links
```

Run state is stored in Data Table `amazon_listing_audit_runs` (`mIDM8w52YybXEwEL`), keyed by `runId`.

## Authenticated Webhook

- URL: `https://workflow.dinve.com/webhook/amazon-listing-audit-v2-7f31c9d4`
- Method: `POST`
- Authentication: n8n Header Auth credential `Amazon Listing Audit Webhook Auth`
- Header name: `X-Amazon-Listing-Audit-Key`

Keep the header value in the n8n credential system or a protected client secret store. Never place it in this repository, an n8n Code/Edit Fields value, logs, or chat.

### Start Request

```json
{
  "action": "start",
  "productUrl": "https://www.amazon.co.jp/dp/B0DPHNQKT5",
  "marketplace": "amazon.co.jp",
  "reportLanguage": "zh-CN",
  "targetAudience": "",
  "positioning": "",
  "focus": "标题、五点、描述、图片、A+、合规、转化与执行优先级",
  "cacheMode": "prefer_cache",
  "decodoCacheTtlHours": 24,
  "visualCacheTtlHours": 720,
  "allowStaleOnError": true,
  "staleMaxAgeHours": 168,
  "maxProductImages": 8,
  "maxAplusImages": 6,
  "publishHtml": true,
  "notifyMattermost": false,
  "dryRun": false
}
```

The caller may provide `asin` instead of `productUrl`. Supported marketplaces are allowlisted in `references/workflow-code/normalize-input.js`.

Successful start response:

```json
{
  "accepted": true,
  "runId": "listing_20260716153358_buccyx",
  "asin": "B0DPHNQKT5",
  "status": "queued",
  "statusUrlHint": "query with action=query and this runId"
}
```

HTTP status is `202`. Invalid input returns `400` with `accepted: false` and validation errors.

### Query Request

```json
{
  "action": "query",
  "runId": "listing_20260716153358_buccyx"
}
```

Query returns HTTP `200` for an existing row and `404` for an unknown `runId`.

## Run State

| Field | Meaning |
|---|---|
| `status` | `queued`, `running`, `success`, `partial`, `failed`, or `rejected` |
| `phase` | Current worker phase; terminal successful/partial runs use `completed` |
| `visualStatus` | Image-analysis status, independent from final status |
| `publishStatus` | `pending`, `success`, `partial`, `failed`, `disabled`, `dry_run`, or `not_run` |
| `notifyStatus` | `pending`, `success`, `failed`, or `disabled` |
| `errorType` | Stable failure category when present |
| `errorMessage` | Bounded human-readable failure detail |

`success` requires a valid audit and successful requested HTML delivery. `partial` means a usable audit exists but a requested downstream step failed. `failed` means the audit itself is unusable or Listing acquisition failed.

## Report Delivery

The current deterministic renderer is `amazon-listing-audit-html-v2`. It presents a product-first hero, executive decision overview, metric strip, top priorities, per-image visual evidence wall, copy comparison, A+ blueprint, compliance limits, and a P0/P1/P2 execution roadmap. AI output is never used as raw HTML; all model and Listing text is escaped before rendering.

- Bucket: `amazon-reports` (private)
- Latest HTML: `amazon/listing-audits/{ASIN}/index.html`
- Immutable HTML: `amazon/listing-audits/{ASIN}/runs/{runId}/index.html`
- Structured data: `amazon/listing-audits/{ASIN}/runs/{runId}/report.json`
- Manifest: `amazon/listing-audits/{ASIN}/runs/{runId}/manifest.json`
- Gateway: `https://workflow.dinve.com/webhook/amazon-listing-audit-report-v2-5c0a8f2b?key=<encoded-object-key>`
- Latest short URL: `https://data.dinve.com/amazon/listing-audits/{ASIN}/`
- Immutable short URL: `https://data.dinve.com/amazon/listing-audits/{ASIN}/runs/{runId}/`

The unauthenticated gateway only accepts the latest or immutable `index.html` key pattern. It rejects `report.json`, `manifest.json`, arbitrary objects, traversal, and non-allowlisted prefixes. Anyone with a valid report URL can read that HTML, so do not put secrets or private customer data in reports.

Upload success alone is insufficient. The publisher fetches the gateway URL and requires HTTP 200 plus an HTML doctype before returning `publishStatus: success`.
It then verifies the Nginx short URL. A healthy short URL becomes the canonical `htmlReportUrl`; if the short route fails while the private gateway remains healthy, the run returns the gateway URL with `publishStatus: partial` and `deliveryMode: gateway_fallback`.
