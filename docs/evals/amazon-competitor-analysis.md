# Eval: Amazon Competitor Analysis

Use this file to regression-test whether agents trigger and call the right workflow skill.

## Skill Under Test

- Skill id: `amazon-competitor-analysis`
- MCP server: `workflow-dinve-skills`
- Expected MCP tools:
  - `list_workflow_skills`
  - `get_workflow_skill`
  - `run_workflow_skill`

## Expected Agent Flow

1. Recognize the request as Amazon competitor analysis.
2. Call `list_workflow_skills` if the skill id is not already known.
3. Call `get_workflow_skill` with `skillId: "amazon-competitor-analysis"`.
4. Build structured input from user text.
5. Start with `dryRun: true`, `publishWiki: false`, and `notifyMattermost: false` unless the user explicitly asks to publish or notify.
6. Call `run_workflow_skill`.
7. Require `confirmSideEffects: true` before `publishWiki: true` or `notifyMattermost: true`.

## Positive Trigger Prompts

These should use `amazon-competitor-analysis`.

| Prompt | Expected handling |
|---|---|
| `帮我分析这个 Amazon 竞品 B0CW5YZG67` | Put ASIN in `competitorText`, use default marketplace if unspecified. |
| `分析这几个亚马逊竞品链接，给我价格带、卖点和关键词机会` | Put raw pasted links/text in `competitorText`; allow workflow normalization. |
| `我没有我方 ASIN，只想看这个类目的切入机会` | Leave `ownAsin` and `ownProductUrl` empty. |
| `对比竞品评论、评分、图片和 A+ 页面机会` | Use default focus or include these topics in `focus`. |
| `分析完发布到 Wiki` | Set `publishWiki: true` only with explicit user approval and `confirmSideEffects: true`. |
| `分析完发 Mattermost 通知` | Set `notifyMattermost: true` only with explicit user approval and `confirmSideEffects: true`. |
| `多个链接格式比较乱，你自己规范化后分析` | Use `competitorText`; do not require user-normalized URLs. |
| `日本站 amazon.co.jp 的竞品分析，中文输出` | Set `marketplace: "amazon.co.jp"` and `locale: "zh-CN"`. |

## Negative Trigger Prompts

These should not use `amazon-competitor-analysis`.

| Prompt | Expected handling |
|---|---|
| `帮我生成一张商品主图` | Use image generation skill, not competitor analysis. |
| `部署 Wiki.js` | Use `wikijs`, not workflow skill. |
| `把这段 Markdown 发布到 Wiki` | This is a component operation; do not expose component as standalone skill unless wrapped by a business skill. |
| `发一条 Mattermost 消息` | Component workflow only; do not treat as business skill unless a business workflow owns the notification. |
| `分析淘宝竞品` | Ask whether Amazon workflow is still appropriate or use a future marketplace-specific skill. |

## Side Effect Regression

Call:

```json
{
  "skillId": "amazon-competitor-analysis",
  "input": {
    "publishWiki": true
  }
}
```

Expected:

```json
{
  "ok": false,
  "error": "side_effect_confirmation_required"
}
```

The MCP must reject this before calling n8n.

## Dry Run Example

Call:

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

Expected high-level result:

- `ok` is present.
- A report-like field is present: `report` or `output`.
- No Wiki or Mattermost side effect is attempted.

## Publish Example

Only after user approval:

```json
{
  "skillId": "amazon-competitor-analysis",
  "confirmSideEffects": true,
  "input": {
    "competitorText": "B0CW5YZG67",
    "marketplace": "amazon.co.jp",
    "locale": "zh-CN",
    "maxCompetitors": 1,
    "dryRun": false,
    "publishWiki": true,
    "notifyMattermost": false,
    "wikiPathPrefix": "amazon/competitor-analysis"
  }
}
```

Expected high-level result:

- `wikiLink` or `publishStatus` is present.
- No Mattermost notification is attempted.

## Pass Criteria

- Business skill is listed by `list_workflow_skills`.
- Component workflows are not listed as standalone skills.
- `get_workflow_skill` returns the manifest, `SKILL.md`, and contract.
- Side effect guard blocks publish/notify without confirmation.
- Dry-run execution does not publish or notify.
