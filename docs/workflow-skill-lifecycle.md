# Workflow Skill Lifecycle

Use this process whenever a new n8n workflow should become part of `workflow-dinve-skills`.

The core rule is:

- Business capability -> `skills/<skill-id>/` + `workflow-registry/<skill-id>.json`
- Implementation component -> `workflow-registry/components/<component-id>.json`
- Unfinished or unverified business workflow -> `workflow-registry/candidates.md`

Do not create a standalone skill for every workflow.

## 1. Classify The Workflow

Create a business skill when users or agents naturally ask for the capability directly.

Examples:

- Analyze Amazon competitors.
- Generate a product image report.
- Audit Rakuten order sync failures.

Create a component manifest when the workflow is reusable infrastructure.

Examples:

- Publish Markdown to Wiki.js.
- Send Mattermost notification.
- Normalize a payload.
- Store a generated report.

If a workflow only supports another workflow, keep it as a component.

If a workflow has business value but is not production-ready as an agent tool, keep it in:

```text
workflow-registry/candidates.md
```

Candidate workflows must not be added to `workflow-registry/*.json`, because top-level JSON manifests are treated as callable business skills by the MCP server and validation pipeline.

Use candidates for workflows that still lack one or more of:

- Stable input schema.
- Stable output schema.
- `[工具]` main workflow.
- `[MCP入口]` webhook wrapper.
- Structured error response.
- Side-effect guard.
- Representative test run.

## 2. n8n Shape

Business workflow skills should use this structure:

```text
[MCP入口] <capability> webhook
  -> validate and normalize request
  -> Execute Workflow: [工具] <main business workflow>
  -> respond with structured JSON

[工具] <main business workflow>
  -> business logic
  -> optional Execute Workflow: [组件] <component>
  -> return structured JSON

[组件] <component>
  -> small reusable side-effect or transformation
```

The wrapper workflow is the public entrypoint for the MCP server.

## 3. Naming

Use these n8n names:

- Business wrapper: `[MCP入口] <business capability> webhook`
- Business tool: `[工具] <business capability>`
- Component: `[组件] <component capability>`
- Test caller: `[测试] <purpose>`

Use these repository ids:

- Skill id: lowercase kebab-case, for example `amazon-competitor-analysis`.
- Component id: lowercase kebab-case, for example `publish-markdown-to-wiki`.

## 4. Registry Manifest

Business manifest:

```text
workflow-registry/<skill-id>.json
```

Required intent:

- `manifestType: "business-skill"`
- Fixed `n8n.serverUrl`
- Real workflow names and ids
- `transport.url` for private repo mode
- `componentDependencies` when components are used
- Safe `defaults`
- `sideEffectFields`
- `safeSmokeInput`
- `expectedSmokeError`
- `outputFields`

Component manifest:

```text
workflow-registry/components/<component-id>.json
```

Required intent:

- `manifestType: "workflow-component"`
- Fixed `n8n.serverUrl`
- Real component workflow name and id
- No `skillPath`
- No `contractPath`
- No direct MCP listing

## 5. Skill Folder

Only business skills get a folder:

```text
skills/<skill-id>/
  SKILL.md
  references/mcp-contract.md
```

`SKILL.md` should stay short:

- What the skill does.
- When to use it.
- Required MCP call order.
- Safe defaults.
- Side-effect rules.
- Output priorities.

Put detailed fields and examples in `references/mcp-contract.md`.

## 6. Eval File

Every business skill should have:

```text
docs/evals/<skill-id>.md
```

Include:

- Positive trigger prompts.
- Negative trigger prompts.
- Dry-run example.
- Side-effect guard regression.
- Publish/notify examples when relevant.
- Pass criteria.

This is the regression surface for future prompt and workflow changes.

## 7. Status Flow

Use manifest `status`:

```text
draft -> active -> deprecated
```

Use `workflow-registry/candidates.md` before `draft` when the n8n workflow is still being evaluated or redesigned. A `draft` manifest should already have a concrete skill id, `SKILL.md`, workflow ids, and an intended transport shape.

Use `draft` while:

- n8n workflow is not active.
- webhook URL is missing.
- output shape is unstable.
- eval file is missing.

Use `active` only after:

- Registry validation passes.
- MCP smoke test passes.
- n8n workflow has been tested with representative input.
- Side-effect guard is verified.

Promotion path:

```text
candidate note -> draft manifest -> active manifest
```

Do not skip from an unverified n8n workflow directly to `active`.

Use `deprecated` when a replacement exists but callers may still reference the old skill id.

## 8. Update Rules

Backwards-compatible updates:

- Add optional input fields.
- Add output fields.
- Improve prompts or report structure.
- Add component dependencies without changing existing input names.

Breaking updates:

- Rename or remove input fields.
- Change required fields.
- Change side-effect behavior.
- Change output field meaning.
- Replace the webhook wrapper contract.

For breaking updates:

1. Create a new skill id or keep old fields as aliases.
2. Update `mcp-contract.md`.
3. Update evals.
4. Run validation.
5. Mark old manifest `deprecated` only after callers migrate.

## 9. Validation Checklist

Run before committing:

```bash
python3 scripts/validate_workflow_registry.py
node --check install.mjs
cd mcp/workflow-dinve-skills
npm ci --omit=dev
node --check server.mjs
node --check install.mjs
node --check smoke-test.mjs
node smoke-test.mjs
```

For skill folders:

```bash
python3 /Users/leo/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/<skill-id>
```

For existing repository tests:

```bash
python3 tests/test_ecom_generate_image.py
```

## 10. Release Checklist

Before pushing:

- Registry manifest has fixed workflow ids and names.
- `transport.url` points to the intended wrapper webhook.
- No API key, bot token, credential value, or bearer token is committed.
- `SKILL.md` links to `references/mcp-contract.md`.
- `docs/evals/<skill-id>.md` exists for every business skill.
- README or usage docs mention new user-facing skills.
- Component workflows remain under `workflow-registry/components/`.
- Candidate workflows have been removed or updated in `workflow-registry/candidates.md` when promoted.

Commit message format:

```text
Add <skill-id> workflow skill
Update <skill-id> workflow skill
Deprecate <skill-id> workflow skill
```

## 11. Future Installation Behavior

The root installer should stay stable:

```bash
node install.mjs --client codex
```

Adding a new business skill should not require installer changes unless the MCP server behavior changes.

Adding a new component should not affect `list_workflow_skills`.
