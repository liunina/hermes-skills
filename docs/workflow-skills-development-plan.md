# Workflow Skills MCP Development Plan

## 目标

把 `hermes-skills` 从静态 skill tap 扩展为“技能仓库 + workflow registry + MCP 执行层”的统一平台。

核心原则：

- Skill 表示可复用业务能力，不机械等同于单个 workflow。
- Workflow 是 skill 背后的实现单元，可以是一对一、一对多或组件复用。
- `skills/` 只保存业务 skill；发布、通知等底层组件 workflow 只进入 `workflow-registry/components/`。
- Git 仓库只保存公开结构、文档、schema、示例和代码，不保存真实 webhook URL、API key、bot token。
- 所有发布、通知、写入、发送等副作用必须在 registry 中声明，并由 MCP 执行层拦截确认。

## 架构目标

```text
hermes-skills/
  skills/
    <skill-id>/
      SKILL.md
      references/
      scripts/

  workflow-registry/
    schema.json
    <business-skill-id>.json
    components/
      <component-id>.json

  mcp/
    workflow-dinve-skills/
      server.mjs
      install.mjs
      smoke-test.mjs
      templates/
```

## 里程碑状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| M1 | 建立开发计划、registry schema、模板和第一个示例 manifest | Done |
| M2 | 新增 `amazon-competitor-analysis` skill，并接入 registry | Done |
| M3 | 实现 `workflow-dinve-skills` MCP manager skeleton | Done |
| M4 | 增加 registry 校验、MCP smoke test 和 CI 集成 | Done |
| M5 | 文档补齐：安装、扩展、安全规则 | Done |
| M6 | 记录首批组件 workflow manifests：Wiki.js 发布、Mattermost 通知 | Done |
| M7 | 后续迁移更多 workflow skills | Next |

## 任务清单

- [x] 克隆并检查当前 `hermes-skills` 结构。
- [x] 创建本开发计划文件。
- [x] 创建 `workflow-registry/schema.json`。
- [x] 创建 `workflow-registry/amazon-competitor-analysis.json`，不包含真实 webhook URL。
- [x] 创建 `skills/amazon-competitor-analysis/` skill 文档。
- [x] 创建 `mcp/workflow-dinve-skills/` MCP manager。
- [x] 创建 `scripts/validate_workflow_registry.py`。
- [x] 更新 `.github/workflows/validate-skills.yml`。
- [x] 更新 `README.md`，说明 workflow skills 与普通 skills 的关系。
- [x] 运行本地验证。
- [x] 做敏感信息扫描。
- [x] 记录组件 manifest：`publish-markdown-to-wiki`。
- [x] 记录组件 manifest：`send-mattermost-notification`。
- [x] 增加 `sideEffectMode: "always"`，用于默认有副作用的组件 manifest。
- [x] 按业务边界调整：删除组件 `SKILL.md`，组件不作为 agent-facing skill 暴露。
- [x] 重新运行 registry、skill、MCP、安装和敏感信息验证。

## 当前决策

- `workflow-registry/*.json` 是可公开的业务 capability manifest。
- `workflow-registry/components/*.json` 是可公开的组件 workflow manifest，不对应 `skills/` 目录。
- 真实 webhook URL 只通过环境变量或本机 `secrets/` 文件注入。
- `run_workflow_skill` 在执行前检查 side-effect fields。未传 `confirmSideEffects: true` 时拒绝执行。
- `amazon-competitor-analysis` 作为首个示例 skill，但 manifest 使用可公开占位 workflow metadata。
- `mcp/workflow-dinve-skills` 当前提供三个核心工具：`list_workflow_skills`、`get_workflow_skill`、`run_workflow_skill`。
- 当前 smoke test 不依赖真实 webhook。它通过 side-effect guard 验证 MCP 可以在不调用 n8n 的情况下阻止副作用。
- 当前 smoke test 会读取各 manifest 的 `safeSmokeInput` 和 `expectedSmokeError`，避免后续新增 workflow skill 时硬编码测试逻辑。
- 组件类 workflow manifest 使用 `sideEffectMode: "always"`，因为执行本身就是写入或发送动作。

## 验证记录

- 2026-07-09：`python3 scripts/validate_workflow_registry.py` 通过。
- 2026-07-09：`python3 tests/test_ecom_generate_image.py` 通过。
- 2026-07-09：`node --check server.mjs install.mjs smoke-test.mjs` 通过。
- 2026-07-09：`node smoke-test.mjs` 通过。
- 2026-07-09：`node install.mjs --client generic --install-dir /tmp/hermes-workflow-dinve-skills-install-test` 通过。
- 2026-07-09：`skills/amazon-competitor-analysis` 通过 Codex skill quick validation。
- 2026-07-09：新增 `publish-markdown-to-wiki` 和 `send-mattermost-notification` 组件 manifest，并通过 registry/MCP smoke test。
- 2026-07-09：`python3 scripts/validate_workflow_registry.py` 重新通过，验证 3 个 workflow skill manifest。
- 2026-07-09：`python3 tests/test_ecom_generate_image.py` 重新通过，6 个测试通过。
- 2026-07-09：`node --check server.mjs install.mjs smoke-test.mjs` 重新通过。
- 2026-07-09：`node smoke-test.mjs` 重新通过，确认 3 个 MCP tools、业务 skill 列表和 manifest 声明的 side-effect guard。
- 2026-07-09：`node mcp/workflow-dinve-skills/install.mjs --client generic --install-dir /tmp/hermes-workflow-dinve-skills-install-test` 重新通过。
- 2026-07-09：`skills/amazon-competitor-analysis` 通过 Codex skill quick validation；组件 workflow 不再生成 SKILL.md。
- 2026-07-09：敏感信息扫描通过，未发现 JWT/API key、真实 webhook URL 或已知私有 workflow ID。

## 后续更新规则

每完成一项开发，更新：

- 里程碑状态。
- 任务清单。
- 当前决策或偏差。
- 验证记录。
