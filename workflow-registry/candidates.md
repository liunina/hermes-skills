# Workflow Skill Candidates

更新时间：2026-07-10

本文件记录 `workflow.dinve.com` 中“可能适合升级为 workflow skill”的 n8n workflow。这里的条目不是正式 skill，不会被 `workflow-dinve-skills` MCP server 加载，也不会出现在 `list_workflow_skills` 中。

正式可调用 skill 只能放在：

```text
workflow-registry/<skill-id>.json
skills/<skill-id>/SKILL.md
```

组件 workflow 只能放在：

```text
workflow-registry/components/<component-id>.json
```

## 状态定义

| 状态 | 含义 | 是否可被 agent 调用 |
|---|---|---|
| `active-skill` | 已有 registry manifest、skill 文档、MCP wrapper，并验证通过 | 是 |
| `candidate` | 有业务价值，但 workflow 未达到 skill 发布标准 | 否 |
| `component` | 可复用实现单元，只能被业务 workflow 调用 | 否 |
| `test-or-archive` | 测试、旧版、模板或实验流程 | 否 |
| `do-not-expose` | 有生产副作用或风险，不应直接暴露给 agent | 否 |

## 当前正式 Skill

| Skill ID | n8n workflow | Workflow ID | 状态 | 说明 |
|---|---|---|---|---|
| `amazon-competitor-analysis` | `[工具] Analyze Amazon competitors` | `gDbZrWGu5eaE8KAJ` | `active-skill` | 当前唯一正式业务 skill。通过 `[MCP入口] Amazon competitor analysis webhook` 暴露，支持 Wiki 和 Mattermost 可控副作用。 |

## 候选业务 Skills

### 1. `amazon-product-image-analysis`

| 字段 | 内容 |
|---|---|
| 业务目标 | 分析 Amazon 商品图片、主图、卖点图、视觉问题和优化机会。 |
| 主 workflow | `Analyze Amazon product image with Decodo and Gemini` |
| 主 workflow ID | `dxncwsmFPQIrRiKx` |
| 相关组件 | `Analyze images with Gemini proxy` |
| 组件 workflow ID | `EoVUqt6NezV9SkBi` |
| 当前状态 | `candidate` |
| 当前触发方式 | Chat trigger；组件为 Execute Workflow Trigger。 |
| 主要缺口 | 主流程未激活；没有 `[工具]` 标准命名；没有 `[MCP入口]` webhook wrapper；输入输出 schema 未固定；Gemini proxy 的错误返回和批量图片策略需要稳定。 |
| 升级建议 | 先把 `Analyze images with Gemini proxy` 作为组件登记，再 clone/整理主流程为 `[工具] Analyze Amazon product images`，最后新增 webhook wrapper。 |

发布前必须确认：

- 支持 `amazonProductUrl`、`imageUrls`、`prompt`、`locale`、`maxImages`。
- 输出稳定包含 `ok`、`title`、`summary`、`imageFindings`、`recommendations`、`failedImages`。
- 明确是否允许消耗 Gemini/Decodo 额度；如需要，加入显式确认字段。

### 2. `amazon-product-image-generation`

| 字段 | 内容 |
|---|---|
| 业务目标 | 根据 Amazon 商品运营需求生成商品图提示词或调用图片生成流程产出图片。 |
| 主 workflow | `亚马逊商品图片生成` |
| 主 workflow ID | `0JhrEifnoJHJ4eQo` |
| 相关组件 | `Reusable - Alibaba Image Generation` |
| 组件 workflow ID | `zQCgZtfrL38t2DlF` |
| 当前状态 | `candidate` |
| 当前触发方式 | Chat trigger、manual trigger、webhook `amazon-product-image-generate`。 |
| 主要缺口 | 主流程未激活；已有 webhook 但不是统一 `[MCP入口]` wrapper；依赖组件未激活；输出结构和图片 URL 返回规则需要标准化；生成图片会产生额度成本。 |
| 升级建议 | 先明确它是“生成提示词”还是“直接生图”。如果直接生图，应把图片生成视为有成本副作用，加入确认字段。 |

发布前必须确认：

- 输入字段：`productTitle`、`productDescription`、`imageGoal`、`styleLock`、`marketplace`、`locale`、`count`、`size`。
- 输出字段：`ok`、`prompts`、`imageUrls`、`provider`、`costWarning`、`failedItems`。
- 和 `skills/ecom-details-image` 的边界：静态 skill 负责策略和 prompt，workflow skill 负责实际调用 n8n 生图。

### 3. `amazon-listing-adaptation`

| 字段 | 内容 |
|---|---|
| 业务目标 | 基于 Amazon 商品链接、图片和现有 listing，生成本地化 listing 优化建议。 |
| 原 workflow | `AmzonListingAdapt` |
| 原 workflow ID | `YKKggk6QZLyI2dk9` |
| 当前状态 | `candidate` |
| 当前触发方式 | Chat trigger。 |
| 主要缺口 | 这是旧流程，不能直接改坏；没有标准 webhook wrapper；输出结构不适合 MCP 直接消费；聊天触发不适合作为 agent tool。 |
| 升级建议 | clone 原 workflow，创建新的 `[工具] Amazon listing adaptation`，保留原 `AmzonListingAdapt` 不变。 |

发布前必须确认：

- 支持无我方 ASIN 和有我方 ASIN 两种模式。
- 输出稳定包含 `listingScore`、`titleSuggestion`、`bulletSuggestions`、`imageSuggestions`、`keywordSuggestions`、`riskWarnings`。
- 不直接发布，不修改线上 listing，只返回分析建议。

### 4. `amazon-review-analysis`

| 字段 | 内容 |
|---|---|
| 业务目标 | 抓取并总结 Amazon 商品评论，输出痛点、关键词、用户画像和改品机会。 |
| workflow | `Analyze & summarize Amazon product reviews with Decodo, OpenAI and Google Sheets` |
| workflow ID | `10nolev9AkCdYAlq` |
| 当前状态 | `candidate` |
| 当前触发方式 | Manual trigger。 |
| 主要缺口 | 未激活；没有 webhook wrapper；Google Sheets 是外部写入副作用，需要确认是否保留；输入输出 schema 未固定。 |
| 升级建议 | 优先做“只返回报告”的 dry-run skill；Google Sheets 写入作为可选副作用。 |

发布前必须确认：

- 输入字段：`productUrl`、`asin`、`marketplace`、`reviewLimit`、`ratingFilter`、`locale`。
- 输出字段：`ok`、`reviewCount`、`painPoints`、`positiveDrivers`、`keywordInsights`、`productImprovementIdeas`、`report`。
- 如保留 Google Sheets，必须加入 `writeGoogleSheets` 和 `confirmSideEffects`。

### 5. `rakuten-fulfillment-sync-report`

| 字段 | 内容 |
|---|---|
| 业务目标 | 生成乐天自发货同步状态报告、异常诊断和 dry-run 结果。 |
| dry-run workflow | `乐天自发货订单同步 - 分节点 Dry Run` |
| dry-run workflow ID | `1VWqmYkKt2ApYJ9B` |
| production workflow | `乐天自发货订单同步 - 分节点 Production` |
| production workflow ID | `ruvPH8oNSuHxo4u2` |
| 当前状态 | `candidate` / `do-not-expose` |
| 当前触发方式 | Manual trigger、Schedule trigger。 |
| 主要缺口 | Production 会真实同步物流，不能直接暴露为 agent skill；dry-run 可以考虑只输出报告；需要独立 wrapper 和严格副作用保护。 |
| 升级建议 | 只暴露 dry-run 报告或执行状态查询，不开放真实上传物流。Production 只允许人工在 n8n 控制。 |

发布前必须确认：

- 默认只读或 dry-run。
- 禁止默认执行真实回写。
- 输出稳定包含 `pendingCount`、`matchedCount`、`unmatchedCount`、`uploadPreviewCount`、`errors`、`report`。
- 如果未来开放真实同步，必须有二次确认、运行窗口、订单数量上限和审计记录。

## 已登记组件

| Component ID | n8n workflow | Workflow ID | 状态 |
|---|---|---|---|
| `publish-markdown-to-wiki` | `[组件] Publish Markdown to Wiki.js` | `qhUfplbPjLJKhZYA` | `component` |
| `send-mattermost-notification` | `[组件] Send Mattermost notification` | `tojzDW1snwmRaB7Q` | `component` |

## 潜在组件候选

| 建议 component id | n8n workflow | Workflow ID | 说明 |
|---|---|---|---|
| `analyze-images-with-gemini-proxy` | `Analyze images with Gemini proxy` | `EoVUqt6NezV9SkBi` | 适合作为 Amazon 图片分析、Listing 诊断等业务 skill 的底层组件。 |
| `alibaba-image-generation` | `Reusable - Alibaba Image Generation` | `zQCgZtfrL38t2DlF` | 适合作为图片生成类业务 skill 的底层组件；需要明确成本和输出 URL 规则。 |

## 不建议升级为 Skill 的 Workflow

| n8n workflow | Workflow ID | 原因 |
|---|---|---|
| `保存内容到Wiki` | `7422dc0aac534844` | 旧版 Wiki 写入流程，已有正式组件替代。 |
| `同步异常告警` | `LGP5tWkpmNXdzx0g` | Error Trigger 系统告警，不是用户主动调用的业务能力。 |
| `Test native Gemini image analysis` | `xcAKUdJbcrM7ZxUJ` | 测试流程。 |
| `[测试] Call Amazon competitor tool` | `HflcodO8SfFyU4vC` | 测试流程。 |
| `[MCP入口] Amazon competitor analysis webhook` | `xF4kGuDGCOOxyiNy` | MCP wrapper，不是业务 skill。 |
| `My workflow` | `zehjiIjM927pYs8s` | 实验/草稿流程，业务边界不清晰。 |
| `Automate influencer evaluation & campaign management with Instagram/YouTube APIs` | `LDTjvkkyQBGXiUhE` | 与当前 Amazon 电商运营主线关系较弱，后置。 |

## 候选升级为正式 Skill 的门槛

候选 workflow 必须全部满足以下条件，才能从本文件迁移到 `workflow-registry/<skill-id>.json`：

1. 有明确业务用户会直接请求的能力。
2. 有稳定输入 schema，并能处理缺省值。
3. 有稳定输出 schema，失败时也返回结构化 JSON。
4. 有 `[工具]` 主 workflow。
5. 有 `[MCP入口]` webhook wrapper。
6. 副作用字段明确，比如发布、通知、写入表格、生成图片、真实订单同步。
7. 默认 dry-run 或只读，不会意外写入外部系统。
8. 至少一次代表性真实测试通过。
9. 有 `SKILL.md`、`references/mcp-contract.md` 和 `docs/evals/<skill-id>.md`。
10. 通过 `python3 scripts/validate_workflow_registry.py` 和 MCP smoke test。

## 当前推荐推进顺序

1. `amazon-product-image-analysis`
2. `amazon-product-image-generation`
3. `amazon-listing-adaptation`
4. `amazon-review-analysis`
5. `rakuten-fulfillment-sync-report`，仅限 dry-run/report，不开放 production 写入
