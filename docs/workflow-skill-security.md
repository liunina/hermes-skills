# Workflow Skill Security

Workflow skills bridge agents to live n8n workflows. Treat that boundary as production infrastructure.

## Rules

- Public repo mode: do not commit webhook URLs.
- Private repo mode: fixed webhook URLs may be committed in `transport.url`.
- Do not commit API keys, bot tokens, JWTs, OAuth tokens, passwords, or n8n credentials.
- Do not hardcode secrets in n8n workflow node text fields.
- Store service credentials in n8n Credentials.
- Store MCP webhook URLs in `transport.url`, local secret files, or environment variables.
- Use `chmod 600` when using local secret files.
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

- webhook URLs, unless intentionally using private repo mode with `transport.url`
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

For component workflow manifests that always write or send, use:

```json
{
  "sideEffectMode": "always"
}
```

Business skill execution must still require `confirmSideEffects: true` before it enables a component that writes or sends.

## Secret Scanning

Run:

```bash
python3 scripts/validate_workflow_registry.py
```

The validator scans for common JWT, bearer token, and OpenAI key shapes. It allows webhook URLs so private repos can keep fixed n8n entrypoints in manifests.
