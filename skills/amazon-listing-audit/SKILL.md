---
name: amazon-listing-audit
description: Audit one Amazon Listing through the production n8n v2 workflow. Use when the user asks to analyze or optimize an Amazon product title, bullets, description, images, A+ content, compliance risk, conversion barriers, or wants a responsive HTML Listing audit report from one ASIN or Amazon product URL.
metadata:
  hermes:
    version: 1.0.0
    author: liunina
    tags: [amazon, listing, audit, ecommerce, n8n, minio, mattermost]
    category: ecommerce
---

# Amazon Listing Audit

Use the active v2 workflows. Do not call or reactivate the archived legacy `AmzonListingAdapt` recovery record (`6gwIlusLe2WDyVGR`).

Read `references/mcp-contract.md` before integrating with the authenticated webhook. Read `references/operations.md` for deployment, monitoring, report delivery, or incident work.

## User Invocation

Mattermost is the normal interactive entrypoint:

- Start: `/workflow listing <ASIN or Amazon URL>`
- Query: `/workflow listing查询 <listing_runId>`
- Report: `/workflow listing报告 <listing_runId>`

The start command acknowledges immediately. The worker runs asynchronously and posts the final status and HTML report link back to Mattermost.

## Direct Workflow Use

For n8n callers, use `[工具] Start Amazon listing audit v2` and then `[工具] Query Amazon listing audit run v2`.

Safe diagnostic defaults:

```json
{
  "productUrl": "https://www.amazon.co.jp/dp/B0DPHNQKT5",
  "reportLanguage": "zh-CN",
  "cacheMode": "prefer_cache",
  "dryRun": true,
  "publishHtml": false,
  "notifyMattermost": false
}
```

Use `publishHtml: true` only when a persistent report is requested. Use `notifyMattermost: true` only with a valid channel and an explicit notification request. A dry run still writes run state and may call Decodo, Gemini, and OpenAI.

## Processing Rules

- Accept exactly one valid 10-character ASIN or supported Amazon product URL.
- Reject unsupported hosts and URL/marketplace mismatches before external calls.
- Prefer fresh Listing and image-analysis cache entries; retain explicit stale-fallback evidence.
- Keep analysis evidence-bounded. Never infer invisible image content or claim A+ is absent when the source cannot prove it.
- Require strict `amazon-listing-audit-v2` JSON before rendering.
- Treat `success`, `partial`, `failed`, and `rejected` as terminal states. Do not report completion from n8n execution status alone; inspect the run row.
- A report is successful only when upload and gateway verification both succeed.

## Important Output

Always return or surface:

- `runId`, `asin`, `status`, and `phase`
- `visualStatus` and `publishStatus`
- `htmlReportUrl` and `htmlArchiveUrl` when available
- `errorType` and `errorMessage` when not fully successful
- `notifyStatus` for Mattermost-triggered runs

Never print credential values, authenticated Mattermost callback URLs, or webhook authentication secrets.
