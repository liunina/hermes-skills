# Hermes Skills

Collection of reusable skills for [Hermes Agent](https://hermes-agent.nousresearch.com/).

This repository is organized as a Hermes skill tap. Skills live under `skills/<name>/` and can include:

- `SKILL.md` — the main agent-facing procedure.
- `references/` — detailed runbooks, API notes, and troubleshooting guides.
- `scripts/` — helper scripts used by the skill.
- `templates/` — reusable templates, if needed.

## Available Skills

| Skill | Category | Description |
|---|---|---|
| `ecom-details-image` | ecommerce | 创建以转化为目标的电商图片简报、PDP/社媒/广告中英文双语 Prompt、Campaign Style Lock，并可通过 OpenAI/ChatGPT、Google Gemini 或 apimart.ai 直接生图。详见 [中文使用指南](./skills/ecom-details-image/README.md)。 |
| `wikijs` | devops | Deploy and manage Wiki.js v2 — Docker deployment with PostgreSQL, nginx reverse proxy, locale configuration, GraphQL API CRUD, and programmatic page management. |
| `amazon-competitor-analysis` | ecommerce | n8n-backed workflow skill for Amazon competitor analysis. Designed to run through the `workflow-dinve-skills` MCP manager. |

## Workflow Skills

Hermes skills are static capabilities: instructions, references, templates, and scripts.

Workflow skills add an execution layer. A workflow skill maps a reusable business capability to one or more published n8n workflows through `workflow-registry/*.json` and the `workflow-dinve-skills` MCP server.

Only business capabilities live under `skills/`. Internal workflow components such as Wiki.js publishing or Mattermost notification are tracked under `workflow-registry/components/` and are not exposed as standalone agent skills.

Core MCP tools:

- `list_workflow_skills` — discover registered workflow skills.
- `get_workflow_skill` — read the manifest and bundled skill instructions.
- `run_workflow_skill` — execute the registered n8n workflow entrypoint.

Component workflow manifests can still declare `sideEffectMode: "always"` for auditability, but they are implementation dependencies rather than user-facing skills.

Install the MCP manager:

```bash
node install.mjs --client codex
```

Usage guide: [docs/usage.md](./docs/usage.md)

For a private repository, fixed n8n webhook URLs can be committed in `workflow-registry/*.json` as `transport.url`. For public or shared installs, use environment variables or local secret files under the installed MCP directory. Do not commit API keys, bot tokens, or credential values.

## Installation

```bash
hermes skills tap add https://github.com/liunina/hermes-skills
hermes skills install wikijs
hermes skills install ecom-details-image
```

If Hermes is already running, start a new session or reload skills so the newly installed skill is available.

## Verify Installation

```bash
hermes skills list | grep wikijs
hermes skills list | grep ecom-details-image
```

You can also inspect the skill from a Hermes session:

```text
/skill wikijs
/skill ecom-details-image
```

Or via the tool interface:

```python
skill_view(name="wikijs")
skill_view(name="ecom-details-image")
```

## Update

```bash
hermes skills update
```

Or pull the latest from the repo and reinstall the skill.

## Contributing

When adding or changing skills:

文档、示例和代码注释默认以中文为主；只有 API 字段名、命令、错误原文、协议名或第三方工具要求时才保留英文。

1. Put each skill under `skills/<skill-name>/`.
2. Keep the main procedure in `SKILL.md`.
3. Put long examples, API references, and troubleshooting details in `references/`.
4. Put reusable helper scripts in `scripts/`.
5. Put executable workflow manifests in `workflow-registry/`.
6. Run local validation before pushing:

```bash
python3 scripts/validate_workflow_registry.py
python3 -m py_compile skills/wikijs/scripts/wiki-tree.py
python3 -m py_compile skills/ecom-details-image/scripts/generate_image.py
python3 tests/test_ecom_generate_image.py
find skills/ecom-details-image/references/templates -name '*.json' -print -exec python3 -m json.tool {} \; >/dev/null
node --check install.mjs
cd mcp/workflow-dinve-skills && npm ci --omit=dev && node smoke-test.mjs
```

## License

MIT. See [LICENSE](./LICENSE).
