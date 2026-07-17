# Amazon 竞品分析 v4 AI 节点与提示词清单

更新时间：2026-07-16  
数据来源：生产 n8n workflow 与仓库内版本化提示词  
适用市场：Amazon 日本站  
当前架构：单品证据包并发分析 + 批次级统一综合分析 + 确定性 Wiki / HTML 渲染

## 1. 工作流范围

| 工作流 | Workflow ID | 作用 |
|---|---|---|
| `[工具] Analyze Amazon competitors orchestrator v2` | `3WraKTwcR36ddo50` | 批量调度、等待单品完成、调用 run-level 综合模型、渲染 Wiki / HTML |
| `[子工作流] Analyze one Amazon competitor item v2` | `XyCRbxXvNPitDUcK` | 单 ASIN 抓取、视觉分析、证据包生成、Schema 校验、缓存入库 |
| `Analyze images with Gemini proxy` | `EoVUqt6NezV9SkBi` | 商品图和 A+ 图片逐图分析与图片缓存 |
| `[子工作流] Publish Amazon competitor HTML report` | `bgSmA8Iog0iTVePj` | 消费结构化结果，生成 MinIO HTML 报告和 report-data.json |

## 2. AI 处理链路

```text
Decodo Listing / Review / Q&A
          +
Gemini 商品图 / A+ 逐图证据
          ↓
单 ASIN 证据包（并发，gpt-5.5）
          ↓
Run-level 市场综合与统一评分（每批一次，gpt-5.5）
          ↓
确定性 Wiki / HTML 渲染 + QA Gate
```

## 3. 模型与版本总览

| 分析层 | 节点 | 模型 | Prompt version | Schema version |
|---|---|---|---|---|
| 图片 / A+ 逐图分析 | `Call Gemini Proxy API` | `gemini-2.5-flash` | `amazon-visual-v4` | `amazon-image-analysis-v4` |
| 单 ASIN 证据分析 | `Analyze competitor strict JSON` | `gpt-5.5` | `amazon-item-evidence-v4` | `amazon-item-evidence-v4` |
| 单 ASIN 修复 | `Retry compact strict JSON analysis` | `gpt-5.5` | `amazon-item-evidence-v4` | `amazon-item-evidence-v4` |
| 批次综合分析 | `Synthesize run-level market strategy` | `gpt-5.5` | `amazon-run-synthesis-v1` | `amazon-run-synthesis-v1` |
| 批次综合修复 | `Retry compact run-level synthesis` | `gpt-5.5` | `amazon-run-synthesis-v1` | `amazon-run-synthesis-v1` |

模型通过部署脚本统一配置：

```bash
AMAZON_ANALYSIS_MODEL=gpt-5.5 \
AMAZON_SYNTHESIS_MODEL=gpt-5.5 \
AMAZON_VISUAL_MODEL=gemini-2.5-flash \
node scripts/provision_amazon_prompt_architecture_v4.mjs --apply
```

不要只在 n8n UI 中修改一个模型节点。单品缓存 key 包含 `analysisModel`、promptVersion 和 schemaVersion，模型与元数据不一致会导致继续命中旧缓存或产生错误归因。

## 4. Gemini 图片 / A+ 分析

### 4.1 `Prepare visual image input`

- 所属工作流：`[子工作流] Analyze one Amazon competitor item v2`
- 类型：Code
- 是否调用 AI：否
- 职责：选择最多 8 张商品图和 4 张 A+ 图，设置模型、批次、缓存和附加业务要求。

当前附加要求：

```text
请逐图分析日本 Amazon 商品图与 A+ 图片。主图重点判断点击识别、主体突出和白底合规；商品副图重点判断卖点解释、效果证据、场景、规格和疑虑消除；A+ 重点判断品牌叙事、信任、对比、FAQ 与转化承接。竞品素材输出可借鉴模式、迁移条件和不可照搬内容；我方素材输出诊断与改版动作。只能依据可见像素。
```

### 4.2 `Build Gemini Strict JSON Payload`

- 所属工作流：`Analyze images with Gemini proxy`
- 类型：Code
- 是否调用 AI：否
- 职责：构造 Gemini `generateContent` 请求、图片技术编号和 JSON Schema。
- endpoint：`https://aihub.dinve.com/v1beta/models/{model}:generateContent`

核心提示要求：

- 不得根据 URL、文件名、ASIN 或常识补全。
- 每张图独立分析，不得跨图片串用文字和判断。
- 主图、商品副图、A+ 使用不同转化评价标准。
- 竞品图片输出借鉴模式、可迁移表达、我方启示和不可照搬内容。
- OCR 与视觉建议分字段保存。

新增 v4 输出字段：

```text
ocrConfidence
funnelStage
claimEvidenceQuality
borrowablePatterns
transferableExpression
ownProductImplication
doNotCopy
```

### 4.3 `Call Gemini Proxy API`

- 类型：HTTP Request
- 模型：`gemini-2.5-flash`
- 认证：n8n `googlePalmApi` Credential
- 超时：120 秒
- 节点重试：最多 3 次，间隔 5 秒

## 5. 单 ASIN 证据分析

### 5.1 `Analyze competitor strict JSON`

- 所属工作流：`[子工作流] Analyze one Amazon competitor item v2`
- 类型：OpenAI node
- 模型：`gpt-5.5`
- 输入：`={{ JSON.stringify($json.analysisInput) }}`
- 职责：把单个 ASIN 的 Listing、Review/Q&A 和视觉结果转成证据包。
- 不再负责：品类评分模型和跨竞品排名。

完整提示词：

- [item-analysis-v4.md](../skills/amazon-competitor-analysis/references/prompts/item-analysis-v4.md)

主要输出：

```text
positioning
priceAnalysis
titleAnalysis
sellingPoints + evidenceRefs
imageAplus + borrowablePatterns
reviewMining + observedCount + evidenceRefs
opportunityPoints / riskPoints
keywords + keyword evidence
listingSuggestionsForOwnProduct
evidenceLimits
```

角色语义：

- `itemRole=own`：机会和风险描述我方当前 Listing / 产品。
- `itemRole=competitor`：机会和风险描述该竞品对我方的启示、压力或进入风险，不生成竞品整改清单。

### 5.2 `Validate first AI JSON`

- 类型：Code
- 是否调用 AI：否
- 职责：不只检查 `JSON.parse`，还检查 v4 必填字段、对象/数组类型、itemRole、Review 样本边界、机会风险对象和优先级枚举。
- 校验脚本：[validate-item-analysis-v4.js](../skills/amazon-competitor-analysis/references/workflow-code/validate-item-analysis-v4.js)

### 5.3 `Retry compact strict JSON analysis`

- 模型：`gpt-5.5`
- 触发条件：JSON 解析或业务 Schema 校验失败。
- 输入：原 analysisInput、validationErrors、invalidOutput。
- 修复策略：完整输出优先修复；截断输出重新生成；不重复 Decodo 或 Gemini。
- 完整提示词：[item-analysis-retry-v4.md](../skills/amazon-competitor-analysis/references/prompts/item-analysis-retry-v4.md)

## 6. Run-level 批次综合分析

### 6.1 `Prepare run-level synthesis input`

- 所属工作流：`[工具] Analyze Amazon competitors orchestrator v2`
- 类型：Code
- 是否调用 AI：否
- 职责：从 Data Table 单品结果生成紧凑的跨竞品比较输入。
- 设计：逐图原始 OCR 和完整 Review 不重复传入；只保留标题、价格、定位、证据摘要、视觉漏斗、主题和机会风险。
- 脚本：[prepare-run-synthesis-v1.js](../skills/amazon-competitor-analysis/references/workflow-code/prepare-run-synthesis-v1.js)

按真实 2 ASIN 回归数据，压缩后约 2.0 万字符；按我方加 8 个竞品估算约 9 万字符，避免把所有逐图原始结果直接堆入综合模型。

### 6.2 `Synthesize run-level market strategy`

- 类型：OpenAI node
- 模型：`gpt-5.5`
- 调用频率：每个 run 一次
- 职责：统一评分模型、跨竞品分层、我方机会风险、标题关键词策略、视觉/A+ 策略和行动计划。
- 完整提示词：[run-synthesis-v1.md](../skills/amazon-competitor-analysis/references/prompts/run-synthesis-v1.md)

主要输出：

```text
marketConclusion
categoryScoringModel
scorecards[]
ownDecision.opportunities[]
ownDecision.risks[]
ownDecision.actionPlan[]
titleStrategy
keywordStrategy
imageAplusStrategy
reviewStrategy
evidenceLimits
```

### 6.3 `Validate run-level synthesis JSON`

- 检查所有成功 ASIN 是否被 scorecards 精确覆盖。
- 检查所有 scorecard 的维度 key 和顺序是否一致。
- 检查评分维度为 4–6 个、权重合计为 100。
- 检查 ownDecision 机会、风险和行动计划结构。
- 脚本：[validate-run-synthesis-v1.js](../skills/amazon-competitor-analysis/references/workflow-code/validate-run-synthesis-v1.js)

### 6.4 `Finalize run-level synthesis`

- 对模型评分做确定性归一化。
- 只按完全一致的 dimension key 映射，不再使用模糊匹配或数组位置映射。
- 缺失分数保持 `null`，覆盖率低于 60% 不生成总分。
- 综合 AI 失败时进入确定性降级报告，不中断 Wiki / HTML 渲染。
- 脚本：[finalize-run-synthesis-v1.js](../skills/amazon-competitor-analysis/references/workflow-code/finalize-run-synthesis-v1.js)

## 7. 报告渲染

`Generate final professional report` 和 HTML publisher 均不再自行发明经营结论，而是优先消费 `reportInput.marketSynthesis`：

- 管理层结论来自 `marketConclusion.headline`。
- 我方机会和风险来自 `ownDecision`，不再汇总竞品自身机会风险。
- P0 / P1 / P2 来自 `ownDecision.actionPlan`。
- 标题和关键词模块消费 `titleStrategy` 与 `keywordStrategy`。
- 图片证据墙消费 `borrowablePatterns`、`ownProductImplication` 和 `doNotCopy`。
- run-level 综合失败时回退到单品结构化结果和确定性模板。

## 8. 真实回归结果

测试 run：`acr_20260716044836_u82yrl`  
对象：我方 `B0GJKY5V5W` + 竞品 `B0FVLW9CNB`

```text
单品 v4 Schema：2 / 2 通过
Run-level Schema：首次输出通过，无重试
统一评分维度：5 个
我方评分：75.6，coverage 100%，reliability high
竞品评分：81.7，coverage 100%，reliability high
我方机会：4 项
我方风险：4 项
行动计划：6 项
Run-level 模型耗时：约 117 秒
最终 run 状态：success
```

生产调用仍推荐 `mode=hybrid`，通过 `runId` 查询结果；同步等待 120 秒不足以覆盖首次图片分析和 run-level 综合分析。

缓存复跑：`acr_20260716051424_ld7fx7`

```text
我方单品：约 4.0 秒，Listing / 12 张视觉 / 最终分析全部命中缓存，OpenAI 单品调用 0 次
竞品单品：约 2.7 秒，Listing / 7 张视觉 / 最终分析全部命中缓存，OpenAI 单品调用 0 次
压缩后 run-level 输入：约 2.0 万字符，估算约 0.91 万 token
Run-level Schema：首次输出通过
最终 run 状态：success
```

最终分析 hash 已排除 `modelReturnedImageId` 等传输诊断字段，避免“Gemini 新结果”和“相同内容的缓存结果”产生不同 hash。

## 9. 部署与回滚

预览：

```bash
node scripts/provision_amazon_prompt_architecture_v4.mjs
```

应用：

```bash
node scripts/provision_amazon_prompt_architecture_v4.mjs --apply
node scripts/provision_amazon_html_report.mjs --apply
```

两个脚本在 `--apply` 前自动备份生产 workflow 到：

```text
/Users/leo/workflow.dinve.com/tmp/n8n-backups/
```
