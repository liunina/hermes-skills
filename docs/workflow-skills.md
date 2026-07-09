# Workflow Skills

Workflow skills add an executable layer to this skill tap.

Regular skills provide static agent knowledge:

- `SKILL.md`
- `references/`
- `scripts/`
- templates and examples

Workflow skills additionally register an executable n8n workflow entrypoint:

- `workflow-registry/<skill-id>.json`
- `mcp/workflow-dinve-skills`
- fixed workflow config and optional runtime overrides

Only reusable business capabilities become skills under `skills/`.
Reusable implementation workflows stay under `workflow-registry/components/` as component manifests.

## Architecture

```text
Agent
  -> MCP server: workflow-dinve-skills
  -> workflow-registry/<skill-id>.json
  -> skills/<skill-id>/SKILL.md
  -> private n8n webhook wrapper
  -> published n8n workflow
  -> optional component workflow manifests
```

## MCP Tools

`list_workflow_skills`

Discover registered workflow skills. Use this before guessing which workflow exists.

`get_workflow_skill`

Read one manifest plus its bundled `SKILL.md` and contract. Agents should call this before first use in a session.

`run_workflow_skill`

Execute one workflow skill by `skillId`. Side-effect fields require `confirmSideEffects: true`.

Component workflow manifests that always write or send, such as Wiki publishing and Mattermost notification, can still declare:

```json
{
  "sideEffectMode": "always"
}
```

Components are not exposed by `list_workflow_skills`; business skills decide when to call them.

## Install

```bash
node install.mjs --client codex
```

For a specific client:

```bash
node install.mjs --client codex
node install.mjs --client claude
node install.mjs --client cursor
node install.mjs --client generic
node install.mjs --client all
```

## Configure Secrets

Each manifest can define a fixed URL, an environment variable, or a local secret file. The MCP resolves them in this order:

1. `transport.url`
2. `transport.urlEnv`
3. `transport.secretFile`

Example:

```json
{
  "transport": {
    "url": "",
    "urlEnv": "AMAZON_COMPETITOR_WEBHOOK_URL",
    "secretFile": "secrets/amazon-competitor-analysis.webhook-url.txt"
  }
}
```

Private repo mode:

```json
{
  "transport": {
    "url": "https://your-n8n.example/webhook/..."
  }
}
```

Runtime environment option:

```bash
export AMAZON_COMPETITOR_WEBHOOK_URL="<private webhook url>"
```

Local file option:

```bash
printf '%s\n' '<private webhook url>' \
  > ~/.mcp/workflow-dinve-skills/secrets/amazon-competitor-analysis.webhook-url.txt
chmod 600 ~/.mcp/workflow-dinve-skills/secrets/amazon-competitor-analysis.webhook-url.txt
```

Do not put API keys, bot tokens, or n8n credential values in the manifest.
