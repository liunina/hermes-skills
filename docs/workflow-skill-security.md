# Workflow Skill Security

Workflow skills bridge agents to live n8n workflows. Treat that boundary as production infrastructure.

## Rules

- Do not commit webhook URLs.
- Do not commit API keys, bot tokens, JWTs, OAuth tokens, passwords, or n8n credentials.
- Do not hardcode secrets in n8n workflow node text fields.
- Store service credentials in n8n Credentials.
- Store MCP webhook URLs in local secret files or environment variables.
- Use `chmod 600` for local secret files.
- Require explicit confirmation for publish, notify, write, send, delete, archive, or update operations.

## Public Repo vs Private Runtime

Safe for Git:

- `SKILL.md`
- references and contracts
- registry manifest structure
- workflow names and generic placeholders
- input/output schema
- side-effect field names

Keep private:

- webhook URLs
- API keys and bearer tokens
- credential values
- customer or internal data
- exact private endpoints if they reveal sensitive infrastructure

## Side Effect Guard

Every manifest can declare:

```json
{
  "sideEffectMode": "field",
  "sideEffectFields": ["publishWiki", "notifyMattermost"]
}
```

`run_workflow_skill` rejects those fields unless the caller passes:

```json
{
  "confirmSideEffects": true
}
```

Agents should only pass confirmation after the user explicitly asks for the side effect.

For component skills that always write or send, use:

```json
{
  "sideEffectMode": "always"
}
```

In this mode, every execution is blocked unless the caller passes `confirmSideEffects: true`.

## Secret Scanning

Run:

```bash
python3 scripts/validate_workflow_registry.py
```

The validator scans for common JWT, bearer token, OpenAI key, and webhook URL shapes.
