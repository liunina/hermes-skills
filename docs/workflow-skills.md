# Workflow Skills

Workflow skills add an executable layer to this skill tap.

Regular skills provide static agent knowledge:

- `SKILL.md`
- `references/`
- `scripts/`
- templates and examples

Workflow skills additionally register an executable n8n workflow entrypoint:

- `workflow-registry/<skill-id>.json`
- `mcp/n8n-workflow-skills`
- runtime secrets stored outside Git

## Architecture

```text
Agent
  -> MCP server: n8n-workflow-skills
  -> workflow-registry/<skill-id>.json
  -> skills/<skill-id>/SKILL.md
  -> private n8n webhook wrapper
  -> published n8n workflow
```

## MCP Tools

`list_workflow_skills`

Discover registered workflow skills. Use this before guessing which workflow exists.

`get_workflow_skill`

Read one manifest plus its bundled `SKILL.md` and contract. Agents should call this before first use in a session.

`run_workflow_skill`

Execute one workflow skill by `skillId`. Side-effect fields require `confirmSideEffects: true`.

Component skills that always write or send, such as Wiki publishing and Mattermost notification, use:

```json
{
  "sideEffectMode": "always"
}
```

For these skills, every execution requires `confirmSideEffects: true`.

## Install

```bash
cd mcp/n8n-workflow-skills
node install.mjs --client generic
```

For a specific client:

```bash
node install.mjs --client codex
node install.mjs --client claude
node install.mjs --client cursor
```

## Configure Secrets

Each manifest defines either an environment variable or a local secret file.

Example:

```json
{
  "transport": {
    "urlEnv": "AMAZON_COMPETITOR_WEBHOOK_URL",
    "secretFile": "secrets/amazon-competitor-analysis.webhook-url.txt"
  }
}
```

Runtime options:

```bash
export AMAZON_COMPETITOR_WEBHOOK_URL="<private webhook url>"
```

or:

```bash
printf '%s\n' '<private webhook url>' \
  > ~/.mcp/n8n-workflow-skills/secrets/amazon-competitor-analysis.webhook-url.txt
chmod 600 ~/.mcp/n8n-workflow-skills/secrets/amazon-competitor-analysis.webhook-url.txt
```

Never commit real webhook URLs.
