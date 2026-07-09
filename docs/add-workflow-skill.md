# Add a Workflow Skill

Use this process when a published n8n workflow should become an agent-callable skill.

## 1. Decide the Skill Boundary

Create a workflow skill only for a reusable capability.

Good examples:

- Amazon competitor analysis
- Publish markdown to Wiki.js
- Send Mattermost notification
- Generate product image report

Avoid creating a skill for every internal workflow if it is only an implementation detail.

## 2. Prepare n8n

Recommended n8n structure:

```text
[MCP入口] <capability> webhook
  -> validate and normalize input
  -> Execute Workflow: [工具] <main workflow>
  -> return structured JSON
```

The webhook wrapper should:

- Validate required input.
- Apply safe defaults.
- Call the published main workflow.
- Return structured JSON.
- Avoid storing secrets in node text fields.

## 3. Create the Skill Folder

```text
skills/<skill-id>/
  SKILL.md
  references/mcp-contract.md
```

`SKILL.md` should explain:

- When to use the skill.
- How to invoke it through `run_workflow_skill`.
- Safe defaults.
- Side effects.
- Important output fields.

## 4. Create the Registry Manifest

Copy:

```text
workflow-registry/templates/workflow-skill.manifest.json
```

to:

```text
workflow-registry/<skill-id>.json
```

Required decisions:

- `id`: stable skill id.
- `status`: use `draft` until tested.
- `workflows`: primary workflow, wrapper workflow, component workflows.
- `transport.urlEnv`: environment variable for webhook URL.
- `transport.secretFile`: local secret file name under the installed MCP directory.
- `defaults`: safe default input.
- `sideEffectFields`: fields that publish, notify, write, send, delete, or mutate state.
- `sideEffectMode`: use `field` when only specific boolean fields trigger side effects; use `always` when the skill writes or sends on every execution.
- `outputFields`: fields the agent should inspect.

## 5. Validate

```bash
python3 scripts/validate_workflow_registry.py
cd mcp/n8n-workflow-skills
npm ci --omit=dev
node smoke-test.mjs
```

## 6. Runtime Secret

Install first:

```bash
cd mcp/n8n-workflow-skills
node install.mjs --client generic
```

Then add the webhook URL outside Git:

```bash
printf '%s\n' '<private webhook url>' \
  > ~/.mcp/n8n-workflow-skills/secrets/<skill-id>.webhook-url.txt
chmod 600 ~/.mcp/n8n-workflow-skills/secrets/<skill-id>.webhook-url.txt
```

## 7. Test Side Effects

Every workflow skill should have a smoke test that does not call the real workflow.

Preferred pattern:

```json
{
  "skillId": "<skill-id>",
  "input": {
    "<sideEffectField>": true
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
