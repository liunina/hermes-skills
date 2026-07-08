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
| `ecom-details-image` | ecommerce | 创建以转化为目标的电商图片简报、PDP/社媒/广告 Prompt、Campaign Style Lock，并可通过 OpenAI/ChatGPT、Google Gemini 或 apimart.ai 直接生图。详见 [中文使用指南](./skills/ecom-details-image/README.md)。 |
| `wikijs` | devops | Deploy and manage Wiki.js v2 — Docker deployment with PostgreSQL, nginx reverse proxy, locale configuration, GraphQL API CRUD, and programmatic page management. |

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
5. Run local validation before pushing:

```bash
python3 -m py_compile skills/wikijs/scripts/wiki-tree.py
python3 -m py_compile skills/ecom-details-image/scripts/generate_image.py
find skills/ecom-details-image/references/templates -name '*.json' -print -exec python3 -m json.tool {} \; >/dev/null
```

## License

MIT. See [LICENSE](./LICENSE).
