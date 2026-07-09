# Usage

This guide explains how another agent should install and call the workflow skills in this repository.

## Install

Run from the repository root:

```bash
node install.mjs --client codex
```

Supported clients:

```bash
node install.mjs --client codex
node install.mjs --client claude
node install.mjs --client cursor
node install.mjs --client generic
node install.mjs --client all
```

Restart the target agent after installation so it reloads MCP servers.

## MCP Server

The installer registers:

- MCP server: `workflow-dinve-skills`
- Installed directory: `~/.mcp/workflow-dinve-skills`
- Main registry: `workflow-registry/*.json`
- Component registry: `workflow-registry/components/*.json`

Fixed n8n server, workflow id, workflow name, and webhook URL are stored in the registry manifests.

## Discover Skills

Call:

```text
list_workflow_skills
```

Expected result includes:

```text
amazon-competitor-analysis
```

Component workflows such as Wiki.js publishing and Mattermost notification are not listed as standalone skills.

## Read Skill Details

Before first use in a session, call:

```json
{
  "skillId": "amazon-competitor-analysis",
  "includeSkillMarkdown": true,
  "includeContract": true
}
```

with MCP tool:

```text
get_workflow_skill
```

## Run Amazon Competitor Analysis

Start with dry-run style execution:

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

Use MCP tool:

```text
run_workflow_skill
```

`competitorText` accepts ASINs, Amazon URLs, messy pasted text, or multiple lines.

If there is no owned ASIN, leave these empty:

```json
{
  "ownAsin": "",
  "ownProductUrl": ""
}
```

If `productIdea` or `targetAudience` are missing, leave them empty and let the workflow infer them.

## Publish Or Notify

Publishing to Wiki.js and notifying Mattermost are side effects.

Only enable them when the user explicitly asks:

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
    "notifyMattermost": true,
    "wikiPathPrefix": "amazon/competitor-analysis",
    "mattermostChannelId": ""
  }
}
```

Without `confirmSideEffects: true`, the MCP server rejects `publishWiki` or `notifyMattermost`.

## Expected Output

Useful fields:

- `ok`
- `httpStatus`
- `title`
- `report` or `output`
- `wikiLink`
- `competitorCount`
- `failedCount`
- `publishStatus`
- `notificationStatus`
- `competitorMatrix`

## Troubleshooting

If MCP tools are missing, restart the agent after install.

If `amazon-competitor-analysis` is not listed, run:

```bash
node install.mjs --client <client>
```

again from the repository root.

If execution returns workflow or webhook errors, check that the n8n workflows are active:

- `[MCP入口] Amazon competitor analysis webhook`
- `[工具] Analyze Amazon competitors`
- `[组件] Publish Markdown to Wiki.js`
- `[组件] Send Mattermost notification`

If Wiki or Mattermost fails, test the component workflow in n8n first.

Do not pass API keys, bot tokens, or n8n credential values to the agent. Those belong in n8n Credentials.
