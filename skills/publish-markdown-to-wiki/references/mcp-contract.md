# MCP Contract: Publish Markdown to Wiki.js

## Skill

- Skill ID: `publish-markdown-to-wiki`
- Registry file: `workflow-registry/publish-markdown-to-wiki.json`
- MCP manager: `n8n-workflow-skills`

## Transport

The skill is executed through a private n8n webhook wrapper.

Runtime configuration:

- Environment variable: `PUBLISH_MARKDOWN_TO_WIKI_WEBHOOK_URL`
- Local secret file: `secrets/publish-markdown-to-wiki.webhook-url.txt`

Do not commit the real webhook URL or Wiki.js API key.

## Input

```json
{
  "title": "Amazon competitor report",
  "path": "home/areas/ecommerce/amazon/listing/example-report",
  "markdown": "# Report\n\nContent...",
  "locale": "zh-CN",
  "description": "",
  "tags": [],
  "mode": "upsert"
}
```

## Side Effect Rule

This is an always-side-effecting component skill because it writes to Wiki.js.

`run_workflow_skill` must reject execution unless:

```json
{
  "confirmSideEffects": true
}
```

## Expected Output

- `ok`
- `httpStatus`
- `wikiLink`
- `pageId`
- `path`
- `title`
- `status`
- `message`

## Safe Smoke Test

```json
{
  "skillId": "publish-markdown-to-wiki",
  "input": {}
}
```

Expected result:

```json
{
  "ok": false,
  "error": "side_effect_confirmation_required"
}
```

This verifies the MCP guard without calling n8n.

