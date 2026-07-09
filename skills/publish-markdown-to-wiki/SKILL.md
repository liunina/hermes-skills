---
name: publish-markdown-to-wiki
description: Publish or update Markdown content in Wiki.js through a registered n8n workflow skill. Use when an agent needs to write a report, analysis, SOP, runbook, or other Markdown document to Wiki.js. This is a side-effecting component skill and requires explicit user approval before execution.
metadata:
  hermes:
    version: 0.1.0
    author: liunina
    tags: [wikijs, markdown, publish, documentation, n8n, workflow]
    category: publishing
---

# Publish Markdown to Wiki.js

Use the `n8n-workflow-skills` MCP manager to publish or update Markdown pages in Wiki.js.

This is a component skill. It can be used directly, or as a dependency of a business skill such as Amazon competitor analysis.

## Invocation

1. Call `get_workflow_skill` with `skillId: "publish-markdown-to-wiki"` before first use in a session.
2. Call `run_workflow_skill` with `skillId: "publish-markdown-to-wiki"`.
3. Always pass `confirmSideEffects: true` only after the user explicitly approves publishing or updating the Wiki.js page.

## Required Inputs

The backing workflow wrapper should accept these fields:

- `title`: Wiki page title.
- `path`: Wiki page path.
- `content` or `markdown`: Markdown body.

Optional fields:

- `locale`: Default `zh-CN`.
- `description`: Optional page description.
- `tags`: Optional page tags.
- `mode`: Usually `upsert`.

## Example

```json
{
  "skillId": "publish-markdown-to-wiki",
  "input": {
    "title": "Amazon competitor report",
    "path": "home/areas/ecommerce/amazon/listing/example-report",
    "markdown": "# Amazon competitor report\n\n...",
    "locale": "zh-CN",
    "mode": "upsert"
  },
  "confirmSideEffects": true
}
```

## Side Effects

This skill writes to Wiki.js. The MCP manager must reject execution unless `confirmSideEffects: true` is supplied.

Never print or store Wiki.js API keys, webhook URLs, or credential values.

## Output

Return:

- `ok`: success boolean.
- `wikiLink`: published page URL.
- `pageId`: Wiki.js page id when available.
- `path`: page path.
- `status`: publish status.
- `message`: diagnostic message.

