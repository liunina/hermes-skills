# MCP Contract: Amazon Competitor Analysis

## Skill

- Skill ID: `amazon-competitor-analysis`
- Registry file: `workflow-registry/amazon-competitor-analysis.json`
- MCP manager: `n8n-workflow-skills`
- Primary MCP call: `run_workflow_skill`

## Transport

The skill is executed through a private n8n webhook wrapper. The webhook URL must be provided at install or runtime through:

- Environment variable: `AMAZON_COMPETITOR_WEBHOOK_URL`
- Local secret file: `secrets/amazon-competitor-analysis.webhook-url.txt`

Do not commit the real webhook URL.

## Input Fields

```json
{
  "competitorUrls": ["https://www.amazon.co.jp/dp/B0CW5YZG67"],
  "competitorText": "",
  "ownProductUrl": "",
  "ownAsin": "",
  "productIdea": "",
  "targetAudience": "",
  "marketplace": "amazon.co.jp",
  "locale": "zh-CN",
  "focus": "价格带、卖点、图片/A+页面、关键词、切入策略",
  "maxCompetitors": 1,
  "dryRun": true,
  "publishWiki": false,
  "notifyMattermost": false,
  "wikiPath": "",
  "wikiPathPrefix": "",
  "mattermostChannelId": "",
  "mattermostBaseUrl": ""
}
```

## Field Rules

- `competitorUrls`: Use normalized Amazon product URLs when available.
- `competitorText`: Use raw ASINs, messy links, pasted notes, or multi-line inputs.
- `ownProductUrl` / `ownAsin`: Optional. Leave empty for market opportunity analysis without an owned product.
- `productIdea` / `targetAudience`: Optional. The workflow may infer them.
- `marketplace`: Amazon marketplace domain, such as `amazon.co.jp` or `amazon.com`.
- `locale`: Default report language, usually `zh-CN`.
- `maxCompetitors`: Start small for cost and stability.
- `dryRun`: Skips Wiki and Mattermost, but may still call AI and scraping services inside the workflow.
- `publishWiki`: Side effect. Requires `confirmSideEffects: true`.
- `notifyMattermost`: Side effect. Requires `confirmSideEffects: true`.

## Expected Output Fields

- `ok`: Overall success boolean.
- `httpStatus`: Webhook HTTP status.
- `title`: Report title.
- `report` / `output`: Markdown report.
- `wikiLink`: Wiki.js page URL when published.
- `competitorCount`: Number of competitor listings analyzed.
- `failedCount`: Number of failed competitor fetches.
- `publishStatus`: Wiki publishing status.
- `notificationStatus`: Mattermost notification status.
- `competitorMatrix`: Structured comparison data.
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

