#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const BASE_URL = (process.env.N8N_BASE_URL || 'https://workflow.dinve.com').replace(/\/+$/, '');
const API_KEY = process.env.N8N_API_KEY;
const ANALYSIS_MODEL = process.env.AMAZON_ANALYSIS_MODEL || 'gpt-5.5';
const SYNTHESIS_MODEL = process.env.AMAZON_SYNTHESIS_MODEL || ANALYSIS_MODEL;
const VISUAL_MODEL = process.env.AMAZON_VISUAL_MODEL || 'gemini-2.5-flash';
const ITEM_ID = 'XyCRbxXvNPitDUcK';
const ORCHESTRATOR_ID = '3WraKTwcR36ddo50';
const GEMINI_ID = 'EoVUqt6NezV9SkBi';
if (!API_KEY) throw new Error('N8N_API_KEY is required.');

const here = path.dirname(fileURLToPath(import.meta.url));
const referenceDir = path.resolve(here, '../skills/amazon-competitor-analysis/references');
const readReference = (relativePath) => readFile(path.join(referenceDir, relativePath), 'utf8');
const [
  itemPrompt,
  itemRetryPrompt,
  runPrompt,
  runRetryPrompt,
  validateItemCode,
  prepareRunCodeSource,
  validateRunCode,
  finalizeRunCode,
  generateProfessionalReportCode,
  formatFinalReportCode,
] = await Promise.all([
  readReference('prompts/item-analysis-v4.md'),
  readReference('prompts/item-analysis-retry-v4.md'),
  readReference('prompts/run-synthesis-v1.md'),
  readReference('prompts/run-synthesis-retry-v1.md'),
  readReference('workflow-code/validate-item-analysis-v4.js'),
  readReference('workflow-code/prepare-run-synthesis-v1.js'),
  readReference('workflow-code/validate-run-synthesis-v1.js'),
  readReference('workflow-code/finalize-run-synthesis-v1.js'),
  readReference('workflow-code/generate-professional-report-v4.js'),
  readReference('workflow-code/format-final-report-v4.js'),
]);
const prepareRunCode = prepareRunCodeSource.replace("synthesisModel: 'gpt-5.5'", `synthesisModel: ${JSON.stringify(SYNTHESIS_MODEL)}`);

async function api(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}/api/v1${pathname}`, {
    method,
    headers: { 'X-N8N-API-KEY': API_KEY, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${pathname} failed (${response.status}): ${text.slice(0, 1200)}`);
  return data;
}

const minimalWorkflow = (workflow) => ({
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: { executionOrder: workflow.settings?.executionOrder || 'v1' },
});

const nodeByName = (workflow, name) => {
  const node = workflow.nodes.find((entry) => entry.name === name);
  if (!node) throw new Error(`Node not found: ${workflow.name} / ${name}`);
  return node;
};

function upsertNode(workflow, node) {
  const index = workflow.nodes.findIndex((entry) => entry.name === node.name);
  if (index === -1) workflow.nodes.push(node);
  else workflow.nodes[index] = { ...node, id: workflow.nodes[index].id };
}

const setModel = (node, model) => {
  node.parameters.modelId = { __rl: true, value: model, mode: 'id', cachedResultName: model };
  node.retryOnFail = true;
  node.maxTries = 3;
  node.waitBetweenTries = 5000;
};

function ifNode(name, position, expression) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: randomUUID(), leftValue: expression, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  };
}

function codeNode(name, position, jsCode) {
  return {
    parameters: { jsCode, mode: 'runOnceForAllItems' },
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

const visualExtraPrompt = '请逐图分析日本 Amazon 商品图与 A+ 图片。主图重点判断点击识别、主体突出和白底合规；商品副图重点判断卖点解释、效果证据、场景、规格和疑虑消除；A+ 重点判断品牌叙事、信任、对比、FAQ 与转化承接。竞品素材输出可借鉴模式、迁移条件和不可照搬内容；我方素材输出诊断与改版动作。只能依据可见像素。';

function patchItemWorkflow(workflow) {
  const patched = structuredClone(workflow);
  const prepare = nodeByName(patched, 'Prepare single competitor input');
  prepare.parameters.jsCode = prepare.parameters.jsCode
    .replace(/analysisPromptVersion:\s*'[^']+'/, "analysisPromptVersion: 'amazon-item-evidence-v4'")
    .replace(/analysisSchemaVersion:\s*'[^']+'/, "analysisSchemaVersion: 'amazon-item-evidence-v4'")
    .replace(/analysisModel:\s*'[^']+'/, `analysisModel: ${JSON.stringify(ANALYSIS_MODEL)}`);

  const visual = nodeByName(patched, 'Prepare visual image input');
  visual.parameters.jsCode = visual.parameters.jsCode
    .replace(/prompt:\s*'[^']*'/, `prompt: ${JSON.stringify(visualExtraPrompt)}`)
    .replace(/model:\s*'[^']+'/, `model: ${JSON.stringify(VISUAL_MODEL)}`)
    .replace(/promptVersion:\s*'[^']+'/, "promptVersion: 'amazon-visual-v4'")
    .replace(/schemaVersion:\s*'[^']+'/, "schemaVersion: 'amazon-image-analysis-v4'");

  const primary = nodeByName(patched, 'Analyze competitor strict JSON');
  setModel(primary, ANALYSIS_MODEL);
  primary.parameters.responses.values = [
    { role: 'system', content: itemPrompt.trim() },
    { content: '={{ JSON.stringify($json.analysisInput) }}' },
  ];
  primary.continueOnFail = true;

  const validate = nodeByName(patched, 'Validate first AI JSON');
  validate.parameters.jsCode = validateItemCode.trim();

  const cacheKey = nodeByName(patched, 'Build analysis cache key');
  cacheKey.parameters.jsCode = cacheKey.parameters.jsCode.replace(
    "'matchStrategy','cacheTtlHoursApplied','expiresAt'",
    "'matchStrategy','modelReturnedImageId','cacheTtlHoursApplied','expiresAt'"
  );

  const prepareRetry = nodeByName(patched, 'Prepare compact AI retry');
  prepareRetry.parameters.jsCode = "const state = $input.first().json || {}; return [{ json: { ...state, retryRequest: { analysisInput: state.analysisInput || {}, validationErrors: state.analysisValidation?.errors || [], invalidOutput: state.aiRawText || '' } } }];";

  const retry = nodeByName(patched, 'Retry compact strict JSON analysis');
  setModel(retry, ANALYSIS_MODEL);
  retry.parameters.responses.values = [
    { role: 'system', content: itemRetryPrompt.trim() },
    { content: '={{ JSON.stringify($json.retryRequest) }}' },
  ];
  retry.continueOnFail = true;

  const format = nodeByName(patched, 'Format item result');
  let code = format.parameters.jsCode;
  const validationHelper = `
const requiredItemFields = ['positioning','priceAnalysis','titleAnalysis','sellingPoints','imageAplus','reviewMining','opportunityPoints','riskPoints','keywords','listingSuggestionsForOwnProduct','evidenceLimits'];
const finalSchemaErrors = [];
if (parsed?.schemaVersion !== 'amazon-item-evidence-v4') finalSchemaErrors.push('schemaVersion must equal amazon-item-evidence-v4');
for (const key of requiredItemFields) if (parsed?.[key] === undefined || parsed?.[key] === null) finalSchemaErrors.push('missing ' + key);
if (parsed?.itemRole && parsed.itemRole !== (base.itemRole || 'competitor')) finalSchemaErrors.push('itemRole mismatch');`;
  if (!code.includes('requiredItemFields')) code = code.replace("let status = 'success';", validationHelper + "\nlet status = 'success';");
  code = code.replace(
    "else if (!Object.keys(parsed || {}).length) { status = 'failed'; errorType = 'invalid_json'; errorMessage = 'AI did not return valid strict JSON'; parsed = { rawText: aiText.slice(0, 2000) }; }",
    "else if (!Object.keys(parsed || {}).length) { status = 'failed'; errorType = 'invalid_json'; errorMessage = 'AI did not return valid strict JSON'; parsed = { rawText: aiText.slice(0, 2000) }; }\nelse if (finalSchemaErrors.length) { status = 'failed'; errorType = 'invalid_schema'; errorMessage = finalSchemaErrors.slice(0, 8).join('; '); }"
  );
  code = code.replace(
    /const scoring = normalizeScoring\(parsed,[^\n]+\);\nparsed = \{ \.\.\.parsed, \.\.\.scoring \};/,
    "parsed = { ...parsed, categoryScoringModel: null, scorecard: { totalScore: null, confidence: 0, coverage: 0, rankingReliability: 'insufficient', dimensions: [] } };"
  );
  code = code.replace(
    "reportHints: { languagePolicy: 'zh-CN-with-ja-evidence-quotes', displayMainImage: true, titleMaxCharsAmazonJp: 75 },",
    "analysisValidation: { passed: status === 'success' && finalSchemaErrors.length === 0, errors: finalSchemaErrors, schemaVersion: 'amazon-item-evidence-v4' }, reportHints: { languagePolicy: 'zh-CN-with-ja-evidence-quotes', displayMainImage: true, titleMaxCharsAmazonJp: 75 },"
  );
  format.parameters.jsCode = code;
  return patched;
}

function patchGeminiWorkflow(workflow) {
  const patched = structuredClone(workflow);
  const build = nodeByName(patched, 'Build Gemini Strict JSON Payload');
  let code = build.parameters.jsCode;
  if (!code.includes('claimEvidenceQuality')) {
    code = code.replace(
      "mobileReadability: { type: 'STRING', enum: ['poor','fair','good','excellent'] },",
      "mobileReadability: { type: 'STRING', enum: ['poor','fair','good','excellent'] },\n    ocrConfidence: { type: 'INTEGER' },\n    funnelStage: { type: 'STRING', enum: ['click','benefit','proof','reduce_risk','brand_trust','comparison','faq','unknown'] },\n    claimEvidenceQuality: { type: 'STRING', enum: ['none','weak','medium','strong'] },"
    ).replace(
      "conversionStrengths: { type: 'ARRAY', items: { type: 'STRING' } },",
      "conversionStrengths: { type: 'ARRAY', items: { type: 'STRING' } },\n    borrowablePatterns: { type: 'ARRAY', items: { type: 'STRING' } },\n    transferableExpression: { type: 'STRING' },\n    ownProductImplication: { type: 'STRING' },\n    doNotCopy: { type: 'ARRAY', items: { type: 'STRING' } },"
    );
  }
  const instructionBlock = `const instructions = [
    '你是日本亚马逊 Listing 的视觉转化、素材借鉴与合规分析师。只根据实际可见像素分析，不得根据 URL、文件名、ASIN 或常识补全。',
    '逐图返回结果，results 数量必须与输入图片数量完全一致。不同图片之间不得串用文字、卖点或判断。',
    'imageId 只能原样使用技术编号：' + allowedImageIds.join(', ') + '。不得返回 gallery_1、main_image、aplus_1 等业务标签。',
    '主图重点评估点击识别、主体突出、配件可见性和白底合规；商品副图重点评估单图信息层级、卖点证明、规格、场景和疑虑消除；A+ 重点评估品牌叙事、信任、对比、FAQ 与转化承接。',
    '竞品图片优先输出 borrowablePatterns、transferableExpression、ownProductImplication 与 doNotCopy；不要把竞品素材写成我方缺陷。',
    '看不清或未读取到图片时 imageReadSuccess=false，其余字段使用空数组、空字符串或 unknown，禁止虚构。',
    'visibleText 尽可能逐字记录可辨认的日文/英文；visibleClaims 只记录可见宣称。ocrConfidence 为 0-100 整数。',
    'scores 均为 0-100 整数；claimEvidenceQuality 判断画面是否为宣称提供了可见证据。所有说明用简洁中文。',
    '技术编号与来源标签仅供定位：' + imageRefs.map(ref => ref.imageId + '=' + (ref.sourceLabel || ref.image.role || 'image')).join(', '),
    config.prompt ? ('附加分析要求：' + config.prompt) : '',
  ].filter(Boolean).join('\\n');`;
  code = code.replace(/const instructions = \[[\s\S]*?\]\.filter\(Boolean\)\.join\('\n'\);/, instructionBlock);
  code = code.replace(
    "'composition','mobileReadability','complianceRisks','conversionStrengths','scores','opportunities','risks','evidence'",
    "'composition','mobileReadability','ocrConfidence','funnelStage','claimEvidenceQuality','complianceRisks','conversionStrengths','borrowablePatterns','transferableExpression','ownProductImplication','doNotCopy','scores','opportunities','risks','evidence'"
  );
  build.parameters.jsCode = code;

  const parse = nodeByName(patched, 'Parse and Validate Per-Image JSON');
  let parseCode = parse.parameters.jsCode;
  if (!parseCode.includes('claimEvidenceQuality')) {
    parseCode = parseCode.replace(
      "mobileReadability: ['poor','fair','good','excellent'].includes(raw.mobileReadability) ? raw.mobileReadability : 'fair',",
      "mobileReadability: ['poor','fair','good','excellent'].includes(raw.mobileReadability) ? raw.mobileReadability : 'fair',\n      ocrConfidence: score(raw.ocrConfidence),\n      funnelStage: ['click','benefit','proof','reduce_risk','brand_trust','comparison','faq','unknown'].includes(raw.funnelStage) ? raw.funnelStage : 'unknown',\n      claimEvidenceQuality: ['none','weak','medium','strong'].includes(raw.claimEvidenceQuality) ? raw.claimEvidenceQuality : 'none',"
    ).replace(
      "complianceRisks: arr(raw.complianceRisks), conversionStrengths: arr(raw.conversionStrengths),",
      "complianceRisks: arr(raw.complianceRisks), conversionStrengths: arr(raw.conversionStrengths),\n      borrowablePatterns: arr(raw.borrowablePatterns), transferableExpression: short(raw.transferableExpression),\n      ownProductImplication: short(raw.ownProductImplication), doNotCopy: arr(raw.doNotCopy),"
    );
  }
  parse.parameters.jsCode = parseCode;
  const call = nodeByName(patched, 'Call Gemini Proxy API');
  call.retryOnFail = true;
  call.maxTries = 3;
  call.waitBetweenTries = 5000;
  return patched;
}

function aiNodeFrom(template, name, position, prompt, userContent, model) {
  const node = structuredClone(template);
  node.id = randomUUID();
  node.name = name;
  node.position = position;
  setModel(node, model);
  node.parameters.responses.values = [{ role: 'system', content: prompt.trim() }, { content: userContent }];
  node.continueOnFail = true;
  return node;
}

function patchOrchestratorWorkflow(workflow, aiTemplate) {
  const patched = structuredClone(workflow);
  const alreadyInstalled = patched.nodes.some((node) => node.name === 'Prepare run-level synthesis input');
  if (!alreadyInstalled) {
    for (const node of patched.nodes) if (Array.isArray(node.position) && node.position[0] >= 1904) node.position[0] += 1568;
  }

  const aggregate = nodeByName(patched, 'Aggregate item rows');
  let aggregateCode = aggregate.parameters.jsCode;
  const scoringStart = aggregateCode.indexOf('const modelCandidates');
  const scoringEnd = aggregateCode.indexOf('\nconst ownEntry = enriched.find', scoringStart);
  if (scoringStart >= 0 && scoringEnd > scoringStart) aggregateCode = aggregateCode.slice(0, scoringStart) + aggregateCode.slice(scoringEnd + 1);
  aggregateCode = aggregateCode.replaceAll('categoryScoringModel: canonicalModel', 'categoryScoringModel: null');
  aggregate.parameters.jsCode = aggregateCode;

  const prepare = codeNode('Prepare run-level synthesis input', [1904, 336], prepareRunCode.trim());
  const shouldRun = ifNode('Should run market synthesis?', [2128, 336], '={{ $json.shouldRunSynthesis === true }}');
  const synthesize = aiNodeFrom(aiTemplate, 'Synthesize run-level market strategy', [2352, 240], runPrompt, '={{ JSON.stringify($json.synthesisInput) }}', SYNTHESIS_MODEL);
  const validate = codeNode('Validate run-level synthesis JSON', [2576, 240], validateRunCode.trim());
  const shouldRetry = ifNode('Should retry market synthesis?', [2800, 240], '={{ $json.shouldRetrySynthesis === true }}');
  const retry = aiNodeFrom(
    aiTemplate,
    'Retry compact run-level synthesis',
    [3024, 144],
    runRetryPrompt,
    "={{ JSON.stringify({ synthesisInput: $json.synthesisInput, validationErrors: $json.synthesisValidation?.errors || [], invalidOutput: $json.synthesisRawText || '' }) }}",
    SYNTHESIS_MODEL,
  );
  const finalize = codeNode('Finalize run-level synthesis', [3248, 336], finalizeRunCode.trim());
  for (const node of [prepare, shouldRun, synthesize, validate, shouldRetry, retry, finalize]) upsertNode(patched, node);

  patched.connections['Aggregate item rows'] = { main: [[{ node: 'Prepare run-level synthesis input', type: 'main', index: 0 }]] };
  patched.connections['Prepare run-level synthesis input'] = { main: [[{ node: 'Should run market synthesis?', type: 'main', index: 0 }]] };
  patched.connections['Should run market synthesis?'] = { main: [[{ node: 'Synthesize run-level market strategy', type: 'main', index: 0 }], [{ node: 'Finalize run-level synthesis', type: 'main', index: 0 }]] };
  patched.connections['Synthesize run-level market strategy'] = { main: [[{ node: 'Validate run-level synthesis JSON', type: 'main', index: 0 }]] };
  patched.connections['Validate run-level synthesis JSON'] = { main: [[{ node: 'Should retry market synthesis?', type: 'main', index: 0 }]] };
  patched.connections['Should retry market synthesis?'] = { main: [[{ node: 'Retry compact run-level synthesis', type: 'main', index: 0 }], [{ node: 'Finalize run-level synthesis', type: 'main', index: 0 }]] };
  patched.connections['Retry compact run-level synthesis'] = { main: [[{ node: 'Finalize run-level synthesis', type: 'main', index: 0 }]] };
  patched.connections['Finalize run-level synthesis'] = { main: [[{ node: 'Generate final professional report', type: 'main', index: 0 }]] };

  nodeByName(patched, 'Generate final professional report').parameters.jsCode = generateProfessionalReportCode.trim();
  nodeByName(patched, 'Format final report').parameters.jsCode = formatFinalReportCode.trim();

  const archiveInstalled = patched.nodes.some((node) => node.name === 'Prepare Wiki archive publish input');
  if (!archiveInstalled) {
    const shiftNames = new Set(['Attach final Wiki link', 'Upsert run final', 'Return orchestrator result']);
    for (const entry of patched.nodes) if (shiftNames.has(entry.name)) entry.position[0] += 448;
  }
  const prepareArchive = codeNode('Prepare Wiki archive publish input', [5488, 240], "function ctx(){ try { const x=$('Attach HTML report link').first().json||{}; if(Object.keys(x).length) return x; } catch {} try { const x=$('Skip HTML publish').first().json||{}; if(Object.keys(x).length) return x; } catch {} return $('Format final report').first().json||{}; } const out=ctx(); return [{ json: { title: out.title + ' · Run ' + (out.reportInput?.runId || out.runId || ''), markdown: out.markdown, path: out.wikiArchivePath, locale: 'zh', description: 'Amazon 竞品分析不可变运行归档', tags: ['amazon','competitor','analysis','run-archive'], sourceType: 'n8n-workflow', sourceUrl: out.htmlArchiveUrl || out.htmlReportUrl || '', author: '[工具] Analyze Amazon competitors orchestrator v2' } }];");
  const publishArchive = structuredClone(nodeByName(patched, 'Publish final Wiki report'));
  publishArchive.id = randomUUID();
  publishArchive.name = 'Publish Wiki run archive';
  publishArchive.position = [5712, 240];
  publishArchive.onError = 'continueRegularOutput';
  upsertNode(patched, prepareArchive);
  upsertNode(patched, publishArchive);
  nodeByName(patched, 'Prepare final Wiki publish input').parameters.jsCode = "function ctx(){ try { const x=$('Attach HTML report link').first().json||{}; if(Object.keys(x).length) return x; } catch {} try { const x=$('Skip HTML publish').first().json||{}; if(Object.keys(x).length) return x; } catch {} return $('Format final report').first().json||{}; } const out=ctx(); return [{ json: { title: out.title, markdown: out.markdown, path: out.wikiPath, locale: 'zh', description: 'Amazon 竞品分析综合报告', tags: ['amazon','competitor','analysis'], sourceType: 'n8n-workflow', sourceUrl: out.htmlReportUrl || '', author: '[工具] Analyze Amazon competitors orchestrator v2' } }];";
  nodeByName(patched, 'Attach final Wiki link').parameters.jsCode = "function ctx(){ try { const x=$('Attach HTML report link').first().json||{}; if(Object.keys(x).length) return x; } catch {} try { const x=$('Skip HTML publish').first().json||{}; if(Object.keys(x).length) return x; } catch {} return $('Format final report').first().json||{}; } const out=ctx(); const latest=$('Publish final Wiki report').first().json||{}; const archive=$input.first().json||{}; let rowInput={}; try { rowInput=JSON.parse(out.row?.inputJson_object||'{}'); } catch {} rowInput.wikiArchive={wikiArchivePath:out.wikiArchivePath||'',wikiArchiveLink:archive.wikiLink||out.wikiArchiveLink||'',publish:archive}; const row={...(out.row||{}),inputJson_object:JSON.stringify(rowInput),finalWikiLink:latest.wikiLink||latest.link||''}; return [{json:{...out,row,wikiPublish:latest,wikiLink:row.finalWikiLink,wikiArchivePublish:archive,wikiArchiveLink:archive.wikiLink||out.wikiArchiveLink||''}}];";
  patched.connections['Publish final Wiki report'] = { main: [[{ node: 'Prepare Wiki archive publish input', type: 'main', index: 0 }]] };
  patched.connections['Prepare Wiki archive publish input'] = { main: [[{ node: 'Publish Wiki run archive', type: 'main', index: 0 }]] };
  patched.connections['Publish Wiki run archive'] = { main: [[{ node: 'Attach final Wiki link', type: 'main', index: 0 }]] };

  const sticky = nodeByName(patched, 'V2 architecture note');
  sticky.parameters.content = '## Amazon 竞品分析 v4 编排器\n单品证据包并发分析 → 批次级统一评分与经营综合 → 确定性 Wiki/HTML 渲染 → QA Gate。评分只在 run-level 使用同一套维度完成，单品节点不再各自生成评分口径。';
  return patched;
}

function validateGraph(workflow, requiredEdges = []) {
  const errors = [];
  const names = workflow.nodes.map((node) => node.name);
  const ids = workflow.nodes.map((node) => node.id);
  if (new Set(names).size !== names.length) errors.push('duplicate node names');
  if (new Set(ids).size !== ids.length) errors.push('duplicate node ids');
  const nameSet = new Set(names);
  for (const [source, outputs] of Object.entries(workflow.connections || {})) {
    if (!nameSet.has(source)) errors.push(`connection source missing: ${source}`);
    for (const lists of Object.values(outputs || {})) for (const list of lists || []) for (const target of list || []) if (!nameSet.has(target.node)) errors.push(`connection target missing: ${source} -> ${target.node}`);
  }
  for (const [source, target] of requiredEdges) {
    const found = Object.values(workflow.connections?.[source] || {}).flat(2).some((entry) => entry?.node === target);
    if (!found) errors.push(`required edge missing: ${source} -> ${target}`);
  }
  return errors;
}

function validateCodeSyntax(workflow, nodeNames) {
  const errors = [];
  for (const name of nodeNames) {
    const node = nodeByName(workflow, name);
    const source = node.parameters?.jsCode;
    if (!source) continue;
    try { new Function(source); } catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  return errors;
}

const [itemWorkflow, orchestratorWorkflow, geminiWorkflow] = await Promise.all([
  api(`/workflows/${ITEM_ID}`),
  api(`/workflows/${ORCHESTRATOR_ID}`),
  api(`/workflows/${GEMINI_ID}`),
]);
const patchedItem = patchItemWorkflow(itemWorkflow);
const patchedGemini = patchGeminiWorkflow(geminiWorkflow);
const patchedOrchestrator = patchOrchestratorWorkflow(orchestratorWorkflow, nodeByName(patchedItem, 'Analyze competitor strict JSON'));

const validations = {
  item: validateGraph(patchedItem, [['Analyze competitor strict JSON', 'Validate first AI JSON'], ['Retry compact strict JSON analysis', 'Format item result']]),
  gemini: validateGraph(patchedGemini, [['Call Gemini Proxy API', 'Parse and Validate Per-Image JSON']]),
  orchestrator: validateGraph(patchedOrchestrator, [['Aggregate item rows', 'Prepare run-level synthesis input'], ['Finalize run-level synthesis', 'Generate final professional report'], ['Publish final Wiki report', 'Prepare Wiki archive publish input'], ['Publish Wiki run archive', 'Attach final Wiki link']]),
  itemCode: validateCodeSyntax(patchedItem, ['Prepare single competitor input', 'Prepare visual image input', 'Build analysis cache key', 'Validate first AI JSON', 'Prepare compact AI retry', 'Format item result']),
  geminiCode: validateCodeSyntax(patchedGemini, ['Build Gemini Strict JSON Payload', 'Parse and Validate Per-Image JSON']),
  orchestratorCode: validateCodeSyntax(patchedOrchestrator, ['Aggregate item rows', 'Prepare run-level synthesis input', 'Validate run-level synthesis JSON', 'Finalize run-level synthesis', 'Generate final professional report', 'Format final report', 'Prepare Wiki archive publish input', 'Attach final Wiki link']),
};
if (Object.values(validations).some((errors) => errors.length)) throw new Error(`Local workflow validation failed: ${JSON.stringify(validations)}`);

const summary = {
  apply: APPLY,
  models: { analysis: ANALYSIS_MODEL, synthesis: SYNTHESIS_MODEL, visual: VISUAL_MODEL },
  versions: { itemPrompt: 'amazon-item-evidence-v4', visualPrompt: 'amazon-visual-v4', runSynthesis: 'amazon-run-synthesis-v1', reportRenderer: 'v4.1-evidence-linked-renderer' },
  workflows: {
    item: { id: ITEM_ID, beforeNodes: itemWorkflow.nodes.length, afterNodes: patchedItem.nodes.length },
    gemini: { id: GEMINI_ID, beforeNodes: geminiWorkflow.nodes.length, afterNodes: patchedGemini.nodes.length },
    orchestrator: { id: ORCHESTRATOR_ID, beforeNodes: orchestratorWorkflow.nodes.length, afterNodes: patchedOrchestrator.nodes.length },
  },
  validations,
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(here, '../../tmp/n8n-backups', `${stamp}-amazon-prompt-architecture-v4-before-apply`);
await mkdir(backupDir, { recursive: true });
await Promise.all([
  writeFile(path.join(backupDir, `${ITEM_ID}__item.json`), JSON.stringify(itemWorkflow, null, 2)),
  writeFile(path.join(backupDir, `${GEMINI_ID}__gemini.json`), JSON.stringify(geminiWorkflow, null, 2)),
  writeFile(path.join(backupDir, `${ORCHESTRATOR_ID}__orchestrator.json`), JSON.stringify(orchestratorWorkflow, null, 2)),
]);

await api(`/workflows/${GEMINI_ID}`, { method: 'PUT', body: minimalWorkflow(patchedGemini) });
await api(`/workflows/${ITEM_ID}`, { method: 'PUT', body: minimalWorkflow(patchedItem) });
await api(`/workflows/${ORCHESTRATOR_ID}`, { method: 'PUT', body: minimalWorkflow(patchedOrchestrator) });
for (const id of [GEMINI_ID, ITEM_ID, ORCHESTRATOR_ID]) {
  try { await api(`/workflows/${id}/activate`, { method: 'POST', body: {} }); } catch {}
}

const [savedItem, savedOrchestrator, savedGemini] = await Promise.all([
  api(`/workflows/${ITEM_ID}`),
  api(`/workflows/${ORCHESTRATOR_ID}`),
  api(`/workflows/${GEMINI_ID}`),
]);
const verification = {
  item: {
    model: nodeByName(savedItem, 'Analyze competitor strict JSON').parameters.modelId.value,
    promptVersionPresent: nodeByName(savedItem, 'Prepare single competitor input').parameters.jsCode.includes('amazon-item-evidence-v4'),
    validatorPresent: nodeByName(savedItem, 'Validate first AI JSON').parameters.jsCode.includes('requiredItemFields') || nodeByName(savedItem, 'Validate first AI JSON').parameters.jsCode.includes('amazon-item-evidence-v4'),
  },
  gemini: {
    schemaFieldsPresent: nodeByName(savedGemini, 'Build Gemini Strict JSON Payload').parameters.jsCode.includes('borrowablePatterns'),
    parserFieldsPresent: nodeByName(savedGemini, 'Parse and Validate Per-Image JSON').parameters.jsCode.includes('ownProductImplication'),
  },
  orchestrator: {
    synthesisNodePresent: savedOrchestrator.nodes.some((node) => node.name === 'Synthesize run-level market strategy'),
    finalEdgePresent: Object.values(savedOrchestrator.connections?.['Finalize run-level synthesis'] || {}).flat(2).some((entry) => entry?.node === 'Generate final professional report'),
    reportRendererPresent: nodeByName(savedOrchestrator, 'Generate final professional report').parameters.jsCode.includes('v4.1-evidence-linked-renderer'),
    reportQaPresent: nodeByName(savedOrchestrator, 'Format final report').parameters.jsCode.includes('CATEGORY_TEMPLATE_LEAK'),
    wikiArchivePresent: savedOrchestrator.nodes.some((node) => node.name === 'Publish Wiki run archive') && Object.values(savedOrchestrator.connections?.['Publish Wiki run archive'] || {}).flat(2).some((entry) => entry?.node === 'Attach final Wiki link'),
    active: savedOrchestrator.active,
  },
};
if (!verification.item.promptVersionPresent || !verification.item.validatorPresent || !verification.gemini.schemaFieldsPresent || !verification.gemini.parserFieldsPresent || !verification.orchestrator.synthesisNodePresent || !verification.orchestrator.finalEdgePresent || !verification.orchestrator.reportRendererPresent || !verification.orchestrator.reportQaPresent || !verification.orchestrator.wikiArchivePresent) {
  throw new Error(`Post-save verification failed: ${JSON.stringify(verification)}`);
}

console.log(JSON.stringify({ ...summary, apply: true, backupDir, verification }, null, 2));
