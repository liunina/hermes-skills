# Add a Workflow Skill

Use this process when a published n8n workflow should become an agent-callable skill.

For the full lifecycle, update rules, and release checklist, see [workflow-skill-lifecycle.md](./workflow-skill-lifecycle.md).

## 1. Decide the Skill Boundary

Create a workflow skill only for a reusable capability.

Good examples:

- Amazon competitor analysis
- Generate product image report

Do not create a skill for every internal workflow. If a workflow only publishes, notifies, formats, stores, or wraps an implementation detail, record it as a component manifest under `workflow-registry/components/` instead.

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

Only do this for business workflow skills.

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
- `manifestType`: use `business-skill`.
- `status`: use `draft` until tested.
- `workflows`: primary workflow, wrapper workflow, component workflows.
- `componentDependencies`: component manifest ids under `workflow-registry/components/`.
- `transport.url`: fixed webhook URL for private repo mode.
- `transport.urlEnv`: environment variable for webhook URL.
- `transport.secretFile`: local secret file name under the installed MCP directory.
- `defaults`: safe default input.
- `sideEffectFields`: fields that publish, notify, write, send, delete, or mutate state.
- `sideEffectMode`: use `field` when only specific boolean fields trigger side effects; use `always` when the skill writes or sends on every execution.
- `outputFields`: fields the agent should inspect.

## 4.1. Add Component Manifests When Needed

For internal reusable workflows, create:

```text
workflow-registry/components/<component-id>.json
```

Use `manifestType: "workflow-component"`.

Component manifests must not define `skillPath` or `contractPath`. They are implementation metadata, not agent-facing skills.

## 5. Validate

```bash
python3 scripts/validate_workflow_registry.py
node --check install.mjs
cd mcp/workflow-dinve-skills
npm ci --omit=dev
node smoke-test.mjs
```

## 6. Runtime URL

Install first:

```bash
node install.mjs --client generic
```

For private repo mode, put the fixed webhook URL directly in the manifest:

```json
{
  "transport": {
    "url": "https://your-n8n.example/webhook/..."
  }
}
```

For public or shared installs, keep using a local file:

```bash
printf '%s\n' '<private webhook url>' \
  > ~/.mcp/workflow-dinve-skills/secrets/<skill-id>.webhook-url.txt
chmod 600 ~/.mcp/workflow-dinve-skills/secrets/<skill-id>.webhook-url.txt
```

Never put API keys, bot tokens, or n8n credential values in the manifest.

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
