---
name: amazon-competitor-analysis
description: Analyze Amazon competitors through a registered n8n workflow skill. Use when the user asks to compare Amazon ASINs, product links, market positioning, price bands, review patterns, listing opportunities, keywords, A+ page gaps, or publish a competitor report to Wiki.js and optionally notify Mattermost.
metadata:
  hermes:
    version: 0.1.0
    author: liunina
    tags: [amazon, competitor, listing, ecommerce, n8n, workflow]
    category: ecommerce
---

# Amazon Competitor Analysis

Use the `n8n-workflow-skills` MCP manager instead of recreating competitor analysis logic in the agent.

## Invocation

1. Call `get_workflow_skill` with `skillId: "amazon-competitor-analysis"` before the first run in a session.
2. Call `run_workflow_skill` with `skillId: "amazon-competitor-analysis"` and the structured input.
3. Keep `dryRun: true`, `publishWiki: false`, and `notifyMattermost: false` for first runs or debugging.
4. Only set `publishWiki: true` or `notifyMattermost: true` when the user explicitly asks for those side effects. Also pass `confirmSideEffects: true`.

## Defaults

- If the user has no owned ASIN, leave `ownAsin` and `ownProductUrl` empty.
- If the user omits `productIdea` or `targetAudience`, leave them empty and let the workflow infer context.
- Use `competitorText` for raw ASINs, messy links, copied notes, or multi-line user input.
- Use `competitorUrls` for normalized Amazon product URLs.
- Keep `maxCompetitors` small at first. Start with `1` to reduce timeout and API cost risk.

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
- `notifyMattermost`: send a Mattermost notification.

The MCP manager must reject these fields unless `confirmSideEffects: true` is supplied.

## Output

Return business-useful fields first:

1. Report title and short conclusion.
2. Wiki link when published.
3. Number of competitors analyzed and failures.
4. Mattermost notification status when requested.
5. Operational warnings such as AI timeout, Decodo failure, Wiki publish failure, or Mattermost credential failure.

Never print API keys, bot tokens, credential values, or webhook URLs.

