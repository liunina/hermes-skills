#!/usr/bin/env node

const APPLY = process.argv.includes('--apply');
const BASE_URL = (process.env.N8N_BASE_URL || 'https://workflow.dinve.com').replace(/\/+$/, '');
const API_KEY = process.env.N8N_API_KEY;
const ITEM_ID = 'XyCRbxXvNPitDUcK';
const ORCHESTRATOR_ID = '3WraKTwcR36ddo50';
if (!API_KEY) throw new Error('N8N_API_KEY is required.');

async function api(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}/api/v1${pathname}`, {
    method,
    headers: { 'X-N8N-API-KEY': API_KEY, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${pathname} failed (${response.status}): ${text.slice(0, 1000)}`);
  return data;
}

const minimalWorkflow = (workflow) => ({
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: { executionOrder: workflow.settings?.executionOrder || 'v1' },
});

const schema = '{"itemRole":"own|competitor","categoryScoringModel":{"category":"","dimensions":[{"key":"","label":"","weight":0,"reason":""}],"weightTotal":100,"modelVersion":"","source":"ai"},"scorecard":{"totalScore":null,"confidence":0,"coverage":0,"rankingReliability":"high|medium|low|insufficient","dimensions":[{"key":"","score":null,"confidence":0,"evidence":"","evidenceStatus":"observed|inferred|missing"}]},"positioning":{"summary":"","targetAudience":[],"usageScenarios":[],"priceTier":"","trustSignals":[]},"priceAnalysis":{"price":"","priceNumber":null,"valueProposition":"","promotionSignals":[]},"sellingPoints":[{"point":"","evidence":"","strength":"high|medium|low"}],"imageAplus":{"observations":[],"missingContent":[],"conversionFunnelGaps":[]},"reviewMining":{"status":"success|partial|unavailable|failed","positiveThemes":[],"negativeThemes":[],"purchaseBarriers":[],"usageProblems":[],"expectationGaps":[],"frequentQuestions":[],"listingFixes":[],"productFixes":[],"evidenceNotes":[]},"opportunityPoints":[],"riskPoints":[],"keywords":{"core":[],"feature":[],"scenario":[],"longTail":[],"backendSearchTerms":[]},"listingSuggestionsForOwnProduct":{"titleDirection":"","bulletDirections":[],"imageDirections":[],"aplusDirections":[],"faqDirections":[]},"evidenceLimits":[]}';

const scoringRules = `\n\n品类自适应竞争力评分（必须输出）：\n9. 根据 productIdea、Listing 标题和可见证据识别品类，为本次批次生成 categoryScoringModel。通常 4-6 个维度；key、label、weight、reason 稳定，weight 总和为 100。不要把价格机械设为固定高权重，按品类购买决策自动调整。\n10. scorecard 逐维度给出 0-100 分、confidence、evidence、evidenceStatus。没有证据时 score 必须为 null、evidenceStatus=missing，不得用 0 代替缺失。\n11. totalScore 按有分数维度的加权平均并按已观测权重归一化；coverage=已观测权重/100。coverage < 0.60 时 totalScore 必须为 null，rankingReliability=insufficient；否则按 coverage 和 confidence 填 high/medium/low。\n12. 同一 run 的我方和竞品尽量使用相同 categoryScoringModel，不因 itemRole 改变维度或权重。\n13. 评分是基于当前证据的相对竞争力判断，不是 Amazon 星级或销量预测，必须保留 evidence 和置信度。`;

function patchItem(workflow) {
  const w = structuredClone(workflow);
  const input = w.nodes.find((n) => n.name === 'Prepare single competitor input');
  if (input?.parameters?.jsCode) input.parameters.jsCode = input.parameters.jsCode
    .replace(/analysisPromptVersion:\s*'[^']+'/, "analysisPromptVersion: 'amazon-item-analysis-v32-scored'")
    .replace(/analysisSchemaVersion:\s*'[^']+'/, "analysisSchemaVersion: 'amazon-item-analysis-v32-scored'");
  for (const name of ['Analyze competitor strict JSON', 'Retry compact strict JSON analysis']) {
    const node = w.nodes.find((n) => n.name === name);
    const values = node?.parameters?.responses?.values;
    if (!values?.[0]?.content) continue;
    let content = values[0].content.replace(/\{"itemRole":"own\|competitor"[\s\S]*?"evidenceLimits":\[\]\}/, schema);
    if (!content.includes('品类自适应竞争力评分')) content += scoringRules;
    values[0].content = content;
  }
  const format = w.nodes.find((n) => n.name === 'Format item result');
  if (format?.parameters?.jsCode && !format.parameters.jsCode.includes('normalizeScoring')) {
    const helper = `
const toNumber = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,，%％]/g, '')); return Number.isFinite(n) ? n : null; };
const fallbackModel = (category) => ({ category: clean(category) || 'Amazon 商品', dimensions: [{ key: 'core_value', label: '核心价值与功能', weight: 30, reason: '是否解决品类核心需求' }, { key: 'quality_trust', label: '质量与信任证据', weight: 20, reason: '材质、耐用性、评价和信任信号' }, { key: 'usability', label: '使用便利与场景适配', weight: 20, reason: '实际使用阻力和场景覆盖' }, { key: 'visual_conversion', label: '图片与页面转化', weight: 15, reason: '页面是否降低购买疑虑' }, { key: 'value_price', label: '价格与价值感', weight: 15, reason: '价格是否被功能和证据支撑' }], weightTotal: 100, modelVersion: 'fallback-v1', source: 'deterministic_fallback' });
const normalizeModel = (raw, category) => { const dims = arr(raw?.dimensions).map((d, i) => ({ key: clean(d?.key) || 'dimension_' + (i + 1), label: clean(d?.label) || clean(d?.key) || '维度 ' + (i + 1), weight: Math.max(0, toNumber(d?.weight) ?? 0), reason: one(d?.reason || '', 160) })).filter((d) => d.weight > 0).slice(0, 8); const model = dims.length ? { category: clean(raw?.category) || clean(category) || 'Amazon 商品', dimensions: dims, weightTotal: 100, modelVersion: clean(raw?.modelVersion) || 'ai-v1', source: clean(raw?.source) || 'ai' } : fallbackModel(category); const sum = model.dimensions.reduce((a, d) => a + d.weight, 0) || 1; model.dimensions = model.dimensions.map((d) => ({ ...d, weight: Math.round((d.weight / sum) * 1000) / 10 })); const rounded = model.dimensions.reduce((a, d) => a + d.weight, 0); if (model.dimensions.length) model.dimensions[model.dimensions.length - 1].weight = Math.round((model.dimensions[model.dimensions.length - 1].weight + (100 - rounded)) * 10) / 10; return model; };
const normalizeScoring = (raw, category) => { const model = normalizeModel(raw?.categoryScoringModel, category); const source = arr(raw?.scorecard?.dimensions); const dimensions = model.dimensions.map((m) => { const found = source.find((d) => clean(d?.key) === m.key) || source.find((d) => clean(d?.label) === m.label); const score = found ? toNumber(found.score) : null; return { key: m.key, score: score === null ? null : Math.max(0, Math.min(100, score)), confidence: found ? Math.max(0, Math.min(1, toNumber(found.confidence) ?? 0)) : 0, evidence: one(found?.evidence || '', 180), evidenceStatus: score === null ? 'missing' : (clean(found?.evidenceStatus) || 'observed') }; }); const observedWeight = dimensions.reduce((sum, d, i) => sum + (d.score === null ? 0 : model.dimensions[i].weight), 0); const weighted = dimensions.reduce((sum, d, i) => sum + (d.score === null ? 0 : d.score * model.dimensions[i].weight), 0); const coverage = Math.round((observedWeight / 100) * 100) / 100; const observed = dimensions.filter((d) => d.score !== null); const confidence = observed.length ? Math.round((observed.reduce((s, d) => s + d.confidence, 0) / observed.length) * 100) / 100 : 0; const totalScore = coverage < 0.6 ? null : Math.round((weighted / (observedWeight || 1)) * 10) / 10; return { categoryScoringModel: model, scorecard: { totalScore, confidence, coverage, rankingReliability: totalScore === null ? 'insufficient' : (coverage >= 0.8 && confidence >= 0.75 ? 'high' : (coverage >= 0.6 && confidence >= 0.5 ? 'medium' : 'low')), dimensions } }; };
`;
    format.parameters.jsCode = format.parameters.jsCode.replace('const listing = scrub(base.listing || {});', helper + "const scoring = normalizeScoring(parsed, base.productIdea || base.focus || 'Amazon 商品');\nparsed = { ...parsed, ...scoring };\nconst listing = scrub(base.listing || {});");
    format.parameters.jsCode = format.parameters.jsCode.replace('const analysis = { itemRole: base.itemRole || \'competitor\', competitorAsin: base.competitorAsin,', 'const analysis = { itemRole: base.itemRole || \'competitor\', competitorAsin: base.competitorAsin, categoryScoringModel: parsed.categoryScoringModel, scorecard: parsed.scorecard,');
  }
  return w;
}

function patchOrchestrator(workflow) {
  const w = structuredClone(workflow);
  const aggregate = w.nodes.find((n) => n.name === 'Aggregate item rows');
  if (aggregate?.parameters?.jsCode) {
    const insert = `
const modelCandidates = enriched.map((x) => x.parsed?.categoryScoringModel).filter((m) => m && Array.isArray(m.dimensions) && m.dimensions.length);
const ownModel = enriched.find((x) => x.itemRole === 'own')?.parsed?.categoryScoringModel;
const canonicalScoringModel = ownModel?.dimensions?.length ? ownModel : (modelCandidates[0] || null);
const canonicalModel = canonicalScoringModel ? { ...canonicalScoringModel, weightTotal: 100, dimensions: canonicalScoringModel.dimensions.map((d) => ({ key: String(d.key || d.label || '').trim(), label: String(d.label || d.key || '').trim(), weight: Number(d.weight) || 0, reason: String(d.reason || '').trim() })).filter((d) => d.key) } : null;
const normalizeCanonicalScore = (parsed) => { if (!canonicalModel) return { totalScore: null, confidence: 0, coverage: 0, rankingReliability: 'insufficient', dimensions: [] }; const source = Array.isArray(parsed?.scorecard?.dimensions) ? parsed.scorecard.dimensions : []; const used = new Set(); const aliases = { ergonomic_support: ['ergonomic','posture','support','sleep'], material_breathability: ['material','comfort','breath','cool','sleep'], hygiene_durability: ['hygiene','maintenance','clean','durab'], trust_social_proof: ['trust','social','proof','rating'], visual_conversion: ['visual','listing','content','conversion'], price_value: ['price','value'] }; const token = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ''); const dims = canonicalModel.dimensions.map((m, index) => { const exact = source.findIndex((x) => !used.has(x) && String(x?.key || '').trim() === m.key); const label = source.findIndex((x) => !used.has(x) && String(x?.label || '').trim() === m.label); const terms = aliases[m.key] || [m.key]; const fuzzy = source.findIndex((x) => !used.has(x) && terms.some((term) => token(x?.key).includes(term) || token(x?.label).includes(term))); const byIndex = source.length === canonicalModel.dimensions.length ? index : -1; const sourceIndex = exact >= 0 ? exact : (label >= 0 ? label : (fuzzy >= 0 ? fuzzy : byIndex)); const d = sourceIndex >= 0 ? source[sourceIndex] : null; if (sourceIndex >= 0) used.add(source[sourceIndex]); const s = d && Number.isFinite(Number(d.score)) ? Math.max(0, Math.min(100, Number(d.score))) : null; return { key: m.key, score: s, confidence: d && Number.isFinite(Number(d.confidence)) ? Math.max(0, Math.min(1, Number(d.confidence))) : 0, evidence: String(d?.evidence || '').trim().slice(0, 180), evidenceStatus: s === null ? 'missing' : String(d?.evidenceStatus || 'observed') }; }); const observedWeight = dims.reduce((sum, d, i) => sum + (d.score === null ? 0 : Number(canonicalModel.dimensions[i].weight || 0)), 0); const weighted = dims.reduce((sum, d, i) => sum + (d.score === null ? 0 : d.score * Number(canonicalModel.dimensions[i].weight || 0)), 0); const coverage = Math.round((observedWeight / 100) * 100) / 100; const observed = dims.filter((d) => d.score !== null); const confidence = observed.length ? Math.round((observed.reduce((s, d) => s + d.confidence, 0) / observed.length) * 100) / 100 : 0; const totalScore = coverage < 0.6 ? null : Math.round((weighted / (observedWeight || 1)) * 10) / 10; return { totalScore, confidence, coverage, rankingReliability: totalScore === null ? 'insufficient' : (coverage >= 0.8 && confidence >= 0.75 ? 'high' : (coverage >= 0.6 && confidence >= 0.5 ? 'medium' : 'low')), dimensions: dims }; };
for (const entry of enriched) { entry.parsed.categoryScoringModel = canonicalModel; entry.parsed.scorecard = normalizeCanonicalScore(entry.parsed); }
`;
    let code = aggregate.parameters.jsCode;
    // Replace the whole scoring block on every provisioning run.  Earlier versions
    // only inserted it when canonicalScoringModel was absent, which meant fixes to
    // aliases and matching rules never reached an already-provisioned workflow.
    const blockStart = code.indexOf('const modelCandidates');
    const blockEnd = code.indexOf('\nconst ownEntry = enriched.find', blockStart);
    if (blockStart >= 0 && blockEnd > blockStart) {
      code = code.slice(0, blockStart) + insert.trimEnd() + code.slice(blockEnd);
    } else if (!code.includes('canonicalScoringModel')) {
      code = code.replace('const ownEntry = enriched.find', insert + '\nconst ownEntry = enriched.find');
    }
    code = code.replace('const toItem = x => ({ itemRole: x.itemRole, asin:', 'const toItem = x => ({ itemRole: x.itemRole, categoryScoringModel: x.parsed.categoryScoringModel, scorecard: x.parsed.scorecard, asin:');
    code = code.replace('finalWikiPath: root.finalWikiPath, generatedAt:', 'categoryScoringModel: canonicalModel, dataQuality: { scorecardCoverage: enriched.map((x) => ({ asin: x.row.competitorAsin, coverage: x.parsed.scorecard?.coverage ?? 0, rankingReliability: x.parsed.scorecard?.rankingReliability || \'insufficient\' })) }, finalWikiPath: root.finalWikiPath, generatedAt:');
    aggregate.parameters.jsCode = code;
  }
  const report = w.nodes.find((n) => n.name === 'Generate final professional report');
  if (report?.parameters?.jsCode && !report.parameters.jsCode.includes('AI 品类自适应竞争力评分')) {
    const section = `\nh2('4. AI 品类自适应竞争力评分');\nconst model = ri.categoryScoringModel;\nif (model && Array.isArray(model.dimensions) && model.dimensions.length) { p('评分模型：' + (model.category || ri.productIdea || '当前品类') + '；权重由 AI 根据品类购买决策生成，同一 run 对我方和竞品统一使用。总分仅在证据覆盖率达到 60% 时参与排序。'); table(['维度','权重','评分依据'], model.dimensions.map(d => [d.label || d.key, String(d.weight || 0) + '%', one(d.reason || '-', 100)])); table(['ASIN','角色','总分','覆盖率','置信度','排名可靠性'], [own, ...successful].filter(Boolean).map(i => { const a = analysisOf(i); const s = a.scorecard || i.scorecard || {}; return [i.asin || ri.ownAsin, i.itemRole === 'own' ? '我方' : '竞品', s.totalScore == null ? '待评分' : String(s.totalScore), Math.round(Number(s.coverage || 0) * 100) + '%', Math.round(Number(s.confidence || 0) * 100) + '%', s.rankingReliability || 'insufficient']; })); } else p('评分模型未返回，当前不进行竞争力排名，避免把缺失数据当成 0 分。'); lines.push('');\n`;
    report.parameters.jsCode = report.parameters.jsCode.replace("h2('4. 价格带、规格带与定位');", section + "\nh2('5. 价格带、规格带与定位');");
    for (let i = 13; i >= 5; i -= 1) report.parameters.jsCode = report.parameters.jsCode.replace(`h2('${i}. `, `h2('${i + 1}. `);
    report.parameters.jsCode = report.parameters.jsCode
      .replace("h2('6. 价格带、规格带与定位');", "h2('__PRICE_SECTION__');")
      .replace("h2('5. 目标人群与使用场景');", "h2('6. 目标人群与使用场景');")
      .replace("h2('__PRICE_SECTION__');", "h2('5. 价格带、规格带与定位');");
    report.parameters.jsCode = report.parameters.jsCode.replace("'## 3. 竞品池概览','## 7. 图片 / A+ / 视频转化漏斗','## 11. P0 / P1 / P2 执行清单','## 12. 失败 / 待补抓'", "'## 3. 竞品池概览','## 8. 图片 / A+ / 视频转化漏斗','## 12. P0 / P1 / P2 执行清单','## 13. 失败 / 待补抓'");
  }
  if (report?.parameters?.jsCode) report.parameters.jsCode = report.parameters.jsCode
    .replace("h2('6. 价格带、规格带与定位');", "h2('__PRICE_SECTION__');")
    .replace("h2('5. 目标人群与使用场景');", "h2('6. 目标人群与使用场景');")
    .replace("h2('__PRICE_SECTION__');", "h2('5. 价格带、规格带与定位');");
  const formatter = w.nodes.find((n) => n.name === 'Format final report');
  if (formatter?.parameters?.jsCode) {
    formatter.parameters.jsCode = formatter.parameters.jsCode
      .replace("'## 3. 竞品池概览','## 7. 图片 / A+ / 视频转化漏斗','## 11. P0 / P1 / P2 执行清单','## 12. 失败 / 待补抓'", "'## 3. 竞品池概览','## 8. 图片 / A+ / 视频转化漏斗','## 12. P0 / P1 / P2 执行清单','## 13. 失败 / 待补抓'");
    const qaFunction = `function qaReport(markdown) {
  const issues = [];
  const warnings = [];
  const entities = [ri.ownBaseline, ...(Array.isArray(ri.items) ? ri.items : [])].filter(Boolean);
  const assetStatus = (entity, key) => {
    const analysis = entity.analysis && typeof entity.analysis === 'object' ? entity.analysis : {};
    const listing = analysis.listing && typeof analysis.listing === 'object' ? analysis.listing : {};
    const completeness = listing.assetCompleteness || analysis.assetCompleteness || analysis.imageAplus?.assetCompleteness || {};
    return String(completeness[key] ?? '').trim().toLowerCase();
  };
  const unknownAplus = entities.some((entity) => ['unknown', 'unknown_not_supported', 'unknown_fetch_failed'].includes(assetStatus(entity, 'aplusStatus')));
  const unknownVideo = entities.some((entity) => ['unknown', 'unknown_not_supported', 'unknown_fetch_failed'].includes(assetStatus(entity, 'videoStatus')));
  // Unknown means the source did not return evidence; it is not proof of absence.
  // Only flag a contradiction when the report explicitly claims absence for an
  // ASIN whose source status is unknown. Keep it a warning so one uncertain
  // competitor cannot block an otherwise valid report publication.
  if (unknownAplus && /(?:没有|无|未发现|不存在)\\s*A\\+/i.test(markdown)) warnings.push({ code: 'APLUS_UNKNOWN_ABSENT_RISK', message: '报告对 A+ 使用了明确缺失表述，但至少一个 ASIN 的数据源状态为 unknown；请人工复核。' });
  if (unknownVideo && /(?:没有|无|未发现|不存在)\\s*(?:视频|视频证据)/i.test(markdown)) warnings.push({ code: 'VIDEO_UNKNOWN_ABSENT_RISK', message: '报告对视频使用了明确缺失表述，但至少一个 ASIN 的数据源状态为 unknown；请人工复核。' });
  for (const required of ['## 0. 快速结论','## 1. 数据完整性与抓取说明','## 3. 竞品池概览','## 8. 图片 / A+ / 视频转化漏斗','## 12. P0 / P1 / P2 执行清单','## 13. 失败 / 待补抓']) if (!markdown.includes(required)) issues.push({ code: 'MISSING_SECTION', message: '缺少章节：' + required });
  const longParagraph = markdown.split(/\\n{2,}/).find((paragraph) => !paragraph.startsWith('|') && !paragraph.startsWith('- ') && paragraph.length > 260);
  if (longParagraph) warnings.push({ code: 'LONG_PARAGRAPH', message: '存在超过 260 字的段落，建议继续拆分。' });
  if (/gaallery/i.test(markdown)) issues.push({ code: 'TYPO_GAALLERY', message: '报告出现 gaallery 拼写异常。' });
  return { passed: issues.length === 0, blockingIssues: issues, warnings, checkedAt: new Date().toISOString(), version: 'v3.2-report-qa' };
}`;
    formatter.parameters.jsCode = formatter.parameters.jsCode.replace(/function qaReport\(markdown\) \{[\s\S]*?\n\}\nconst reportQa = qaReport\(report\);/, qaFunction + '\nconst reportQa = qaReport(report);');
    formatter.parameters.jsCode = formatter.parameters.jsCode.replace(/reportVersion: 'v3\.1-report-qa'/g, "reportVersion: 'v3.2-report-qa'");
  }
  return w;
}

const [item, orchestrator] = await Promise.all([api(`/workflows/${ITEM_ID}`), api(`/workflows/${ORCHESTRATOR_ID}`)]);
const patchedItem = patchItem(item);
const patchedOrchestrator = patchOrchestrator(orchestrator);
if (!APPLY) {
  console.log(JSON.stringify({ apply: false, item: { id: item.id, beforeNodes: item.nodes.length, afterNodes: patchedItem.nodes.length }, orchestrator: { id: orchestrator.id, beforeNodes: orchestrator.nodes.length, afterNodes: patchedOrchestrator.nodes.length }, promptVersion: 'amazon-item-analysis-v32-scored' }, null, 2));
  process.exit(0);
}
const [savedItem, savedOrchestrator] = await Promise.all([
  api(`/workflows/${ITEM_ID}`, { method: 'PUT', body: minimalWorkflow(patchedItem) }),
  api(`/workflows/${ORCHESTRATOR_ID}`, { method: 'PUT', body: minimalWorkflow(patchedOrchestrator) }),
]);
for (const id of [ITEM_ID, ORCHESTRATOR_ID]) { try { await api(`/workflows/${id}/activate`, { method: 'POST', body: {} }); } catch {} }
console.log(JSON.stringify({ apply: true, item: { id: savedItem.id, nodeCount: savedItem.nodes.length }, orchestrator: { id: savedOrchestrator.id, nodeCount: savedOrchestrator.nodes.length }, promptVersion: 'amazon-item-analysis-v32-scored' }, null, 2));
