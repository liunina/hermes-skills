#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const SMOKE_TEST = process.argv.includes('--smoke-test');
const BASE_URL = (process.env.N8N_BASE_URL || 'https://workflow.dinve.com').replace(/\/+$/, '');
const API_KEY = process.env.N8N_API_KEY;
const WEBHOOK_TEST_SECRET = process.env.AMAZON_LISTING_AUDIT_WEBHOOK_KEY || '';
const PROJECT_ID = 'pfb25730rH8kBHmk';
const SOURCE_ITEM_WORKFLOW_ID = 'XyCRbxXvNPitDUcK';
const LISTING_CACHE_TABLE_ID = '2h4HXnijr001xSBa';
const GEMINI_WORKFLOW_ID = 'EoVUqt6NezV9SkBi';
const MATTERMOST_WORKFLOW_ID = 'tojzDW1snwmRaB7Q';
const DECODO_CREDENTIAL_ID = 'lqacwcu6IpgP3i2M';
const OPENAI_CREDENTIAL_ID = 'ypko5ivAFOU0Ex5B';
const S3_CREDENTIAL_ID = 'Ssmp3PXE3qSUYB6m';
const ERROR_WORKFLOW_ID = 'LGP5tWkpmNXdzx0g';
const RUN_TABLE_NAME = 'amazon_listing_audit_runs';
const WEBHOOK_CREDENTIAL_NAME = 'Amazon Listing Audit Webhook Auth';
const WEBHOOK_HEADER_NAME = 'X-Amazon-Listing-Audit-Key';
const WEBHOOK_PATH = 'amazon-listing-audit-v2-7f31c9d4';
const REPORT_GATEWAY_PATH = 'amazon-listing-audit-report-v2-5c0a8f2b';
const REPORT_GATEWAY_BASE_URL = `${BASE_URL}/webhook/${REPORT_GATEWAY_PATH}`;
const NAMES = {
  fetch: '[子工作流] Fetch Amazon listing with cache v2',
  gateway: '[入口] Serve private Amazon listing audit HTML report',
  publisher: '[子工作流] Publish Amazon listing audit HTML report',
  worker: '[工具] Run Amazon listing audit worker v2',
  start: '[工具] Start Amazon listing audit v2',
  query: '[工具] Query Amazon listing audit run v2',
  wrapper: '[MCP入口] Amazon listing audit webhook v2',
};

if (!API_KEY) throw new Error('N8N_API_KEY is required.');

const here = path.dirname(fileURLToPath(import.meta.url));
const referenceDir = path.resolve(here, '../skills/amazon-listing-audit/references');
const readReference = (relativePath) => readFile(path.join(referenceDir, relativePath), 'utf8');
const [normalizeInputCode, normalizeFetchCode, prepareVisualCode, validateAuditCode, auditPrompt, retryPrompt, generateArtifactsCode, returnPublishCode, verifyPublicationCode] = await Promise.all([
  readReference('workflow-code/normalize-input.js'),
  readReference('workflow-code/normalize-fetch-request.js'),
  readReference('workflow-code/prepare-visual-input.js'),
  readReference('workflow-code/validate-audit-json.js'),
  readReference('prompts/listing-audit-v2.md'),
  readReference('prompts/listing-audit-retry-v2.md'),
  readReference('html-report/generate-artifacts.js'),
  readReference('html-report/return-result.js'),
  readReference('html-report/verify-publication.js'),
]);

async function api(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}/api/v1${pathname}`, {
    method,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${pathname} failed (${response.status}): ${text.slice(0, 1400)}`);
  return data;
}

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: extra.id || randomUUID(), name, type, typeVersion, position, parameters, ...extra,
});
const codeNode = (name, position, jsCode, extra = {}) => node(name, 'n8n-nodes-base.code', 2, position, { jsCode, mode: 'runOnceForAllItems' }, extra);
const sticky = (name, position, content, width = 640, height = 280) => node(name, 'n8n-nodes-base.stickyNote', 1, position, { content, width, height, color: 5 });
const main = (target) => ({ main: [[{ node: target, type: 'main', index: 0 }]] });
const ifNode = (name, position, expression) => node(name, 'n8n-nodes-base.if', 2.3, position, {
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: randomUUID(), leftValue: expression, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and',
  },
  options: {},
});
const executeWorkflowNode = (name, position, workflowId, workflowName, wait = true, extra = {}) => node(name, 'n8n-nodes-base.executeWorkflow', 1.1, position, {
  workflowId: { __rl: true, value: workflowId, mode: 'list', cachedResultUrl: `/workflow/${workflowId}`, cachedResultName: workflowName },
  mode: 'each',
  options: { waitForSubWorkflow: wait },
}, extra);
const triggerNode = (name, position, values) => node(name, 'n8n-nodes-base.executeWorkflowTrigger', 1.2, position, {
  workflowInputs: { values },
});
const openAiNode = (name, position, systemPrompt, userExpression) => node(name, '@n8n/n8n-nodes-langchain.openAi', 2.3, position, {
  modelId: { __rl: true, value: 'gpt-5.5', mode: 'id', cachedResultName: 'gpt-5.5' },
  responses: { values: [{ role: 'system', content: systemPrompt.trim() }, { content: userExpression }] },
  builtInTools: {},
  options: {},
}, {
  credentials: { openAiApi: { id: OPENAI_CREDENTIAL_ID, name: 'OpenAI account' } },
  onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
});

const runColumns = [
  ['runId', 'string'], ['asin', 'string'], ['productUrl', 'string'], ['marketplace', 'string'],
  ['listingLocale', 'string'], ['reportLanguage', 'string'], ['status', 'string'], ['phase', 'string'],
  ['visualStatus', 'string'], ['publishStatus', 'string'], ['htmlReportUrl', 'string'], ['htmlArchiveUrl', 'string'],
  ['title', 'string'], ['brand', 'string'], ['inputJson_object', 'string'], ['listingJson_object', 'string'],
  ['visualJson_object', 'string'], ['auditJson_object', 'string'], ['errorType', 'string'], ['errorMessage', 'string'],
  ['notifyStatus', 'string'], ['requestedBy', 'string'], ['channelId', 'string'], ['startedAt', 'string'],
  ['lastUpdatedAt', 'string'], ['finishedAt', 'string'], ['schemaVersion', 'string'], ['promptVersion', 'string'],
  ['attemptCount', 'number'],
];
const columnSchema = runColumns.map(([name, type]) => ({ id: name, displayName: name, required: false, defaultMatch: false, display: true, type, canBeUsedToMatch: true, removed: false }));
const upsertRunNode = (name, position, tableId) => node(name, 'n8n-nodes-base.dataTable', 1.1, position, {
  operation: 'upsert',
  dataTableId: { __rl: true, mode: 'id', value: tableId, cachedResultName: RUN_TABLE_NAME },
  matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'runId', keyValue: '={{ $json.runRow.runId }}' }] },
  columns: {
    mappingMode: 'defineBelow',
    value: Object.fromEntries(runColumns.map(([name]) => [name, `={{ $json.runRow.${name} }}`])),
    matchingColumns: [], schema: columnSchema, attemptToConvertTypes: false, convertFieldsToString: false,
  },
  options: {},
});
const getRunNode = (name, position, tableId) => node(name, 'n8n-nodes-base.dataTable', 1.1, position, {
  operation: 'get',
  dataTableId: { __rl: true, mode: 'id', value: tableId, cachedResultName: RUN_TABLE_NAME },
  matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'runId', keyValue: '={{ $json.runId }}' }] },
  limit: 1,
}, { alwaysOutputData: true });

const workflowSettings = (timeout = 900) => ({ executionOrder: 'v1', executionTimeout: timeout, errorWorkflow: ERROR_WORKFLOW_ID, callerPolicy: 'workflowsFromSameOwner', availableInMCP: false });

function replaceNodeReference(value, from, to) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value).replaceAll(from, to));
}

function buildFetchWorkflow(source) {
  const selectedNames = [
    'When called for one competitor', 'Prepare single competitor input', 'Should lookup listing cache?',
    'Get listing cache', 'Resolve listing cache', 'Should fetch listing?', 'Should update listing cache hit?',
    'Update listing cache hit count', 'Restore cached listing context', 'Prepare listing fetch context',
    'Fetch competitor listing with Decodo', 'Normalize fetched listing', 'Should write listing cache?',
    'Upsert listing cache', 'Restore fetched listing context',
  ];
  const nodes = selectedNames.map((name) => {
    const sourceNode = source.nodes.find((entry) => entry.name === name);
    if (!sourceNode) throw new Error(`Source fetch node missing: ${name}`);
    return structuredClone(sourceNode);
  });
  const renameMap = new Map([
    ['When called for one competitor', 'When called to fetch listing'],
    ['Prepare single competitor input', 'Normalize listing fetch request'],
    ['Fetch competitor listing with Decodo', 'Fetch Amazon listing with Decodo'],
  ]);
  for (const current of nodes) {
    current.name = renameMap.get(current.name) || current.name;
    for (const [from, to] of renameMap) current.parameters = replaceNodeReference(current.parameters, from, to);
  }
  const trigger = nodes.find((entry) => entry.name === 'When called to fetch listing');
  trigger.parameters = { workflowInputs: { values: [
    { name: 'runId' }, { name: 'asin' }, { name: 'productUrl' }, { name: 'marketplace' }, { name: 'geo' },
    { name: 'cacheMode' }, { name: 'decodoCacheTtlHours', type: 'number' }, { name: 'allowStaleOnError', type: 'boolean' },
    { name: 'staleMaxAgeHours', type: 'number' },
  ] } };
  nodes.find((entry) => entry.name === 'Normalize listing fetch request').parameters = { jsCode: normalizeFetchCode.trim(), mode: 'runOnceForAllItems' };
  const decodo = nodes.find((entry) => entry.name === 'Fetch Amazon listing with Decodo');
  decodo.parameters.url = '={{ $("Prepare listing fetch context").first().json.productUrl }}';
  decodo.credentials = { decodoApi: { id: DECODO_CREDENTIAL_ID, name: 'Decodo Credentials account' } };
  decodo.onError = 'continueRegularOutput';
  delete decodo.continueOnFail;
  decodo.retryOnFail = true; decodo.maxTries = 3; decodo.waitBetweenTries = 3000;
  const normalize = nodes.find((entry) => entry.name === 'Normalize fetched listing');
  normalize.parameters.jsCode = normalize.parameters.jsCode
    .replaceAll('Prepare single competitor input', 'Normalize listing fetch request')
    .replace(
      "const stale = state.listingCache?.staleListing && typeof state.listingCache.staleListing === 'object' ? state.listingCache.staleListing : null;",
      "const stale = state.staleCandidate?.listing && typeof state.staleCandidate.listing === 'object' ? state.staleCandidate : null;",
    );
  for (const current of nodes) {
    current.position = [current.position[0] + 480, current.position[1] + 80];
    current.parameters = replaceNodeReference(current.parameters, 'Prepare single competitor input', 'Normalize listing fetch request');
    current.parameters = replaceNodeReference(current.parameters, 'Fetch competitor listing with Decodo', 'Fetch Amazon listing with Decodo');
  }
  nodes.push(sticky('Fetch architecture', [-720, -520], '## Shared Amazon listing fetch\n\nDeterministic marketplace allowlist, Decodo retry, positive/negative cache and stale fallback. Returns a versioned normalized Listing JSON contract.', 600, 260));
  const connections = {
    'When called to fetch listing': main('Normalize listing fetch request'),
    'Normalize listing fetch request': main('Should lookup listing cache?'),
    'Should lookup listing cache?': { main: [[{ node: 'Get listing cache', type: 'main', index: 0 }], [{ node: 'Prepare listing fetch context', type: 'main', index: 0 }]] },
    'Get listing cache': main('Resolve listing cache'),
    'Resolve listing cache': main('Should fetch listing?'),
    'Should fetch listing?': { main: [[{ node: 'Prepare listing fetch context', type: 'main', index: 0 }], [{ node: 'Should update listing cache hit?', type: 'main', index: 0 }]] },
    'Should update listing cache hit?': { main: [[{ node: 'Update listing cache hit count', type: 'main', index: 0 }], [{ node: 'Restore cached listing context', type: 'main', index: 0 }]] },
    'Update listing cache hit count': main('Restore cached listing context'),
    'Prepare listing fetch context': main('Fetch Amazon listing with Decodo'),
    'Fetch Amazon listing with Decodo': main('Normalize fetched listing'),
    'Normalize fetched listing': main('Should write listing cache?'),
    'Should write listing cache?': { main: [[{ node: 'Upsert listing cache', type: 'main', index: 0 }], [{ node: 'Restore fetched listing context', type: 'main', index: 0 }]] },
    'Upsert listing cache': main('Restore fetched listing context'),
  };
  return { name: NAMES.fetch, description: '共享 Amazon Listing 抓取与缓存。输入 ASIN/URL、marketplace 和缓存策略，输出 amazon-listing-cache-v1 标准 Listing JSON。', nodes, connections, settings: workflowSettings(240) };
}

function buildReportGatewayWorkflow() {
  const webhook = node('Amazon listing audit report gateway', 'n8n-nodes-base.webhook', 2.1, [-672, 80], {
    httpMethod: 'GET', path: REPORT_GATEWAY_PATH, authentication: 'none', responseMode: 'responseNode', options: {},
  }, { webhookId: '5c0a8f2b-8c86-4f12-bdb8-3f51c88466d2' });
  const validate = codeNode('Validate listing report object key', [-448, 80], `const source = $input.first().json || {}; const key = String(source.query?.key || '').trim(); const valid = key.length <= 240 && /^amazon\\/listing-audits\\/[A-Z0-9]{10}\\/(?:runs\\/listing_[A-Za-z0-9_-]+\\/)?index\\.html$/.test(key); return [{ json: { key, valid } }];`);
  const valid = ifNode('Report key allowed?', [-224, 80], '={{ $json.valid === true }}');
  const download = node('Download private listing report from MinIO', 'n8n-nodes-base.s3', 1, [0, 0], {
    resource: 'file', operation: 'download', bucketName: 'amazon-reports', fileKey: '={{ $json.key }}', binaryPropertyName: 'data',
  }, {
    credentials: { s3: { id: S3_CREDENTIAL_ID, name: 'MinIO S3 - Amazon Reports' } },
    onError: 'continueErrorOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
  });
  const respondHtml = node('Respond with private listing report HTML', 'n8n-nodes-base.respondToWebhook', 1.5, [224, 0], {
    respondWith: 'binary', responseDataSource: 'set', inputFieldName: 'data', options: {
      responseCode: 200,
      responseHeaders: { entries: [
        { name: 'Content-Type', value: 'text/html; charset=utf-8' },
        { name: 'Content-Disposition', value: 'inline' },
        { name: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=60' },
        { name: 'Content-Security-Policy', value: "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
        { name: 'X-Content-Type-Options', value: 'nosniff' },
        { name: 'Referrer-Policy', value: 'no-referrer' },
      ] },
    },
  });
  const invalid = node('Reject invalid listing report key', 'n8n-nodes-base.respondToWebhook', 1.5, [0, 160], {
    respondWith: 'json', responseBody: '={{ { ok: false, error: "invalid_report_key" } }}',
    options: { responseCode: 400, responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }] } },
  });
  const unavailable = node('Respond listing report unavailable', 'n8n-nodes-base.respondToWebhook', 1.5, [224, 96], {
    respondWith: 'json', responseBody: '={{ { ok: false, error: "report_unavailable" } }}',
    options: { responseCode: 404, responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }] } },
  });
  return {
    name: NAMES.gateway,
    description: '只读 HTML 报告网关。严格校验对象键后，使用 n8n S3 Credential 从私有 MinIO 返回 Listing Audit latest/run index.html；拒绝 JSON、manifest 和任意对象键。',
    nodes: [
      sticky('Private report delivery', [-672, -232], '## Private MinIO HTML gateway\n\nAllowlisted GET only. The bucket remains private; JSON and manifest objects are never served. HTML responses use a restrictive CSP.', 620, 230),
      webhook, validate, valid, download, respondHtml, invalid, unavailable,
    ],
    connections: {
      'Amazon listing audit report gateway': main('Validate listing report object key'),
      'Validate listing report object key': main('Report key allowed?'),
      'Report key allowed?': { main: [[{ node: 'Download private listing report from MinIO', type: 'main', index: 0 }], [{ node: 'Reject invalid listing report key', type: 'main', index: 0 }]] },
      'Download private listing report from MinIO': { main: [[{ node: 'Respond with private listing report HTML', type: 'main', index: 0 }], [{ node: 'Respond listing report unavailable', type: 'main', index: 0 }]] },
    },
    settings: workflowSettings(60),
  };
}

function buildPublisherWorkflow() {
  const trigger = triggerNode('When called to publish listing audit', [-720, 80], [
    { name: 'runId' }, { name: 'asin' }, { name: 'marketplace' }, { name: 'reportLanguage' }, { name: 'status' },
    { name: 'listing', type: 'object' }, { name: 'visualAnalysis', type: 'object' }, { name: 'audit', type: 'object' },
    { name: 's3Bucket' }, { name: 's3Prefix' }, { name: 'publicBaseUrl' }, { name: 'deliveryBaseUrl' },
  ]);
  const generate = codeNode('Generate listing audit artifacts', [-440, 80], generateArtifactsCode.trim());
  const upload = node('Upload listing audit artifacts to MinIO', 'n8n-nodes-base.s3', 1, [-160, 80], {
    resource: 'file', operation: 'upload', bucketName: '={{ $("When called to publish listing audit").first().json.s3Bucket || "amazon-reports" }}',
    fileName: '={{ $json.s3Key }}', binaryData: true, binaryPropertyName: 'data', additionalFields: {},
  }, {
    credentials: { s3: { id: S3_CREDENTIAL_ID, name: 'MinIO S3 - Amazon Reports' } },
    onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
  });
  const done = codeNode('Return listing audit artifact links', [120, 80], returnPublishCode.trim());
  const verify = node('Verify public listing audit report', 'n8n-nodes-base.httpRequest', 4.2, [344, 80], {
    method: 'GET', url: '={{ $json.htmlReportUrl }}', options: {
      response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } },
      timeout: 20000,
    },
  }, { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 });
  const finalize = codeNode('Finalize listing report publication', [568, 80], verifyPublicationCode.trim());
  return {
    name: NAMES.publisher,
    description: '将结构化 Amazon Listing 审计确定性渲染为单文件内联 CSS HTML，发布 MinIO latest、运行归档、JSON 与 manifest，并以匿名 GET 验证报告可交付。',
    nodes: [sticky('Publisher architecture', [-720, -240], '## Deterministic HTML publisher\n\nNo AI-generated HTML. All model text is escaped before rendering. Uploads latest and immutable run artifacts, then verifies the public report URL before returning success.', 620, 230), trigger, generate, upload, done, verify, finalize],
    connections: {
      'When called to publish listing audit': main('Generate listing audit artifacts'),
      'Generate listing audit artifacts': main('Upload listing audit artifacts to MinIO'),
      'Upload listing audit artifacts to MinIO': main('Return listing audit artifact links'),
      'Return listing audit artifact links': main('Verify public listing audit report'),
      'Verify public listing audit report': main('Finalize listing report publication'),
    },
    settings: workflowSettings(180),
  };
}

function buildWorkerWorkflow({ fetchId, publisherId, tableId }) {
  const inputFields = [
    { name: 'runId' }, { name: 'asin' }, { name: 'productUrl' }, { name: 'marketplace' }, { name: 'geo' },
    { name: 'listingLocale' }, { name: 'reportLanguage' }, { name: 'targetAudience' }, { name: 'positioning' }, { name: 'focus' },
    { name: 'cacheMode' }, { name: 'decodoCacheTtlHours', type: 'number' }, { name: 'visualCacheTtlHours', type: 'number' },
    { name: 'allowStaleOnError', type: 'boolean' }, { name: 'staleMaxAgeHours', type: 'number' },
    { name: 'maxProductImages', type: 'number' }, { name: 'maxAplusImages', type: 'number' },
    { name: 'publishHtml', type: 'boolean' }, { name: 'notifyMattermost', type: 'boolean' }, { name: 'channelId' },
    { name: 'mattermostBaseUrl' }, { name: 'requestedBy' }, { name: 'dryRun', type: 'boolean' }, { name: 'promptVersion' },
    { name: 'schemaVersion' }, { name: 'startedAt' }, { name: 'attemptCount', type: 'number' }, { name: 'runRow', type: 'object' },
  ];
  const trigger = triggerNode('When called to run listing audit', [-1248, 128], inputFields);
  const initialize = codeNode('Initialize worker state', [-1024, 128], `const input = $input.first().json || {}; const now = new Date().toISOString(); const runRow = { ...(input.runRow || {}), runId: input.runId, asin: input.asin, productUrl: input.productUrl, marketplace: input.marketplace, listingLocale: input.listingLocale, reportLanguage: input.reportLanguage, status: 'running', phase: 'listing_fetch', visualStatus: 'pending', publishStatus: input.dryRun ? 'dry_run' : 'pending', lastUpdatedAt: now, finishedAt: '', errorType: '', errorMessage: '' }; return [{ json: { ...input, runRow } }];`);
  const upsertRunning = upsertRunNode('Upsert listing audit running', [-800, 128], tableId);
  const restore = codeNode('Restore worker context', [-576, 128], `return [{ json: $('Initialize worker state').first().json || {} }];`);
  const fetch = executeWorkflowNode('Fetch normalized Amazon listing', [-352, 128], fetchId, NAMES.fetch, true);
  const attachListing = codeNode('Attach listing fetch result', [-128, 128], `const base = $('Restore worker context').first().json || {}; const fetched = $input.first().json || {}; const listing = fetched.listing && typeof fetched.listing === 'object' ? fetched.listing : null; return [{ json: { ...base, ...fetched, listing, listingStatus: listing && fetched.listingStatus !== 'failed' ? 'success' : 'failed', listingError: fetched.listingError || (listing ? '' : 'Listing fetch returned no usable data') } }];`);
  const hasListing = ifNode('Has usable listing?', [96, 128], '={{ $json.listingStatus === "success" && Boolean($json.listing?.title) }}');
  const prepareVisual = codeNode('Prepare visual analysis', [320, 32], prepareVisualCode.trim());
  const hasImages = ifNode('Has images to analyze?', [544, 32], '={{ Array.isArray($json.images) && $json.images.length > 0 }}');
  const analyzeVisual = executeWorkflowNode('Analyze listing images with Gemini', [768, -64], GEMINI_WORKFLOW_ID, 'Analyze images with Gemini proxy', true, { onError: 'continueRegularOutput' });
  const skipVisual = codeNode('Skip unavailable visual analysis', [768, 128], `const state = $input.first().json || {}; return [{ json: { ...state, visualAnalysis: { status: 'not_available', totalImages: 0, analyzedImageCount: 0, failedImageCount: 0, results: [], failedImages: [], message: 'No images returned by listing source' }, visualStatus: 'not_available' } }];`);
  const assembleVisual = codeNode('Assemble visual analysis', [992, -64], `const prepared = $('Prepare visual analysis').first().json || {}; const raw = $input.first().json || {}; const total = Number(raw.totalImages || prepared.visualSelection?.totalImages || 0); const analyzed = Number(raw.analyzedImageCount || (Array.isArray(raw.results) ? raw.results.length : 0)); const failed = Number(raw.failedImageCount || (Array.isArray(raw.failedImages) ? raw.failedImages.length : 0)); let visualStatus = 'failed'; if (!total) visualStatus = 'not_available'; else if (analyzed >= total && failed === 0 && raw.status !== 'failed') visualStatus = 'success'; else if (analyzed > 0) visualStatus = 'partial'; const visualAnalysis = { status: visualStatus, totalImages: total, analyzedImageCount: analyzed, failedImageCount: failed, cacheHitCount: Number(raw.cacheHitCount || 0), results: Array.isArray(raw.results) ? raw.results : [], failedImages: Array.isArray(raw.failedImages) ? raw.failedImages : [], usage: raw.usage || {}, error: raw.error || '', message: raw.message || '' }; return [{ json: { ...prepared, visualAnalysis, visualStatus } }];`);
  const prepareAudit = codeNode('Prepare audit request', [1216, 32], `const state = $input.first().json || {}; const listing = state.listing || {}; const visual = state.visualAnalysis || {}; const analysisInput = { schemaVersion: 'amazon-listing-audit-input-v2', runId: state.runId, asin: state.asin, productUrl: state.productUrl, marketplace: state.marketplace, listingLocale: state.listingLocale, reportLanguage: state.reportLanguage, targetAudience: state.targetAudience || '', positioning: state.positioning || '', focus: state.focus || '', listing, visualAnalysis: { ...visual, results: Array.isArray(visual.results) ? visual.results.slice(0, 22) : [], failedImages: Array.isArray(visual.failedImages) ? visual.failedImages.slice(0, 22) : [] } }; return [{ json: { ...state, analysisInput } }];`);
  const primaryAi = openAiNode('Generate strict listing audit JSON', [1440, 32], auditPrompt, '={{ JSON.stringify($json.analysisInput) }}');
  const validate = codeNode('Validate audit JSON', [1664, 32], validateAuditCode.trim());
  const shouldRetry = ifNode('Should retry invalid audit JSON?', [1888, 32], '={{ $json.shouldRetryAudit === true }}');
  const prepareRetry = codeNode('Prepare compact audit retry', [2112, -64], `const state = $input.first().json || {}; return [{ json: { ...state, retryAttempted: true, retryRequest: { analysisInput: state.analysisInput, invalidOutput: String(state.auditRawText || '').slice(0, 24000), validationErrors: state.auditValidation?.errors || [] } } }];`);
  const retryAi = openAiNode('Retry strict listing audit JSON', [2336, -64], retryPrompt, '={{ JSON.stringify($json.retryRequest) }}');
  const validateRetry = codeNode('Validate retry audit JSON', [2560, -64], validateAuditCode.trim());
  const finalize = codeNode('Finalize audit result', [2784, 32], `const state = $input.first().json || {}; const auditValid = state.auditValidation?.valid === true && state.audit && typeof state.audit === 'object'; const visualStatus = state.visualStatus || state.visualAnalysis?.status || 'failed'; const status = auditValid ? (visualStatus === 'success' ? 'success' : 'partial') : 'failed'; return [{ json: { ...state, auditValid, status, phase: auditValid ? 'publishing' : 'analysis_failed', errorType: auditValid ? '' : 'invalid_audit_json', errorMessage: auditValid ? '' : (state.auditValidation?.errors || ['Invalid audit JSON']).join('; ') } }];`);
  const auditValid = ifNode('Audit JSON valid?', [3008, 32], '={{ $json.auditValid === true }}');
  const shouldPublish = ifNode('Should publish HTML?', [3232, -64], '={{ $json.publishHtml === true && $json.dryRun !== true }}');
  const preparePublish = codeNode('Prepare listing HTML publish input', [3456, -160], `const state = $input.first().json || {}; return [{ json: { ...state, s3Bucket: 'amazon-reports', s3Prefix: 'amazon/listing-audits', publicBaseUrl: 'https://data.dinve.com/amazon-reports', deliveryBaseUrl: '${REPORT_GATEWAY_BASE_URL}' } }];`);
  const publish = executeWorkflowNode('Publish listing audit HTML', [3680, -160], publisherId, NAMES.publisher, true, { onError: 'continueRegularOutput' });
  const attachPublish = codeNode('Attach HTML publish result', [3904, -160], `const base = $('Prepare listing HTML publish input').first().json || {}; const result = $input.first().json || {}; return [{ json: { ...base, publishStatus: result.publishStatus || (result.ok ? 'success' : 'failed'), publishError: result.publishError || result.error?.message || '', htmlReportUrl: result.htmlReportUrl || '', htmlArchiveUrl: result.htmlArchiveUrl || '', artifacts: result.artifacts || [] } }];`);
  const skipPublish = codeNode('Skip HTML publish', [3456, 32], `const state = $input.first().json || {}; return [{ json: { ...state, publishStatus: state.dryRun ? 'dry_run' : 'disabled', htmlReportUrl: '', htmlArchiveUrl: '', artifacts: [] } }];`);
  const listingFailure = codeNode('Build listing fetch failure', [320, 256], `const state = $input.first().json || {}; return [{ json: { ...state, auditValid: false, status: 'failed', phase: 'listing_failed', visualStatus: 'not_run', publishStatus: 'not_run', errorType: state.listingErrorType || 'listing_fetch_failed', errorMessage: state.listingError || 'Listing fetch failed', audit: null, visualAnalysis: null } }];`);
  const buildFinal = codeNode('Build final listing audit row', [4128, 32], `const state = $input.first().json || {}; const now = new Date().toISOString(); let status = state.status || 'failed'; if (state.auditValid && state.publishHtml && !['success','dry_run','disabled'].includes(state.publishStatus || '')) status = 'partial'; const runRow = { ...(state.runRow || {}), runId: state.runId, asin: state.asin, productUrl: state.productUrl, marketplace: state.marketplace, listingLocale: state.listingLocale, reportLanguage: state.reportLanguage, status, phase: status === 'failed' ? (state.phase || 'failed') : 'completed', visualStatus: state.visualStatus || 'not_run', publishStatus: state.publishStatus || 'not_run', htmlReportUrl: state.htmlReportUrl || '', htmlArchiveUrl: state.htmlArchiveUrl || '', title: state.listing?.title || '', brand: state.listing?.brand || '', inputJson_object: state.runRow?.inputJson_object || JSON.stringify({ runId: state.runId, asin: state.asin, productUrl: state.productUrl }), listingJson_object: state.listing ? JSON.stringify(state.listing) : '', visualJson_object: state.visualAnalysis ? JSON.stringify(state.visualAnalysis) : '', auditJson_object: state.audit ? JSON.stringify(state.audit) : '', errorType: state.errorType || (state.publishError ? 'publish_failed' : ''), errorMessage: state.errorMessage || state.publishError || '', notifyStatus: state.notifyMattermost ? 'pending' : 'disabled', requestedBy: state.requestedBy || '', channelId: state.channelId || '', startedAt: state.startedAt || now, lastUpdatedAt: now, finishedAt: now, schemaVersion: state.schemaVersion || 'amazon-listing-audit-v2', promptVersion: state.promptVersion || 'amazon-listing-audit-prompt-v2', attemptCount: Number(state.attemptCount || 1) }; return [{ json: { ...state, status, phase: runRow.phase, errorType: runRow.errorType, errorMessage: runRow.errorMessage, notifyStatus: runRow.notifyStatus, runRow } }];`);
  const upsertFinal = upsertRunNode('Upsert final listing audit run', [4352, 32], tableId);
  const restoreFinal = codeNode('Restore final listing audit result', [4576, 32], `return [{ json: $('Build final listing audit row').first().json || {} }];`);
  const shouldNotify = ifNode('Should notify Mattermost?', [4800, 32], '={{ $json.notifyMattermost === true && Boolean($json.channelId) }}');
  const prepareNotify = codeNode('Prepare Mattermost completion message', [5024, -64], `const state = $input.first().json || {}; const ok = ['success','partial'].includes(state.status); const icon = state.status === 'success' ? '✅' : state.status === 'partial' ? '⚠️' : '❌'; const link = state.htmlReportUrl ? '\\n[查看 HTML 报告](' + state.htmlReportUrl + ')' : ''; const message = icon + ' Amazon Listing 审计' + (ok ? '完成' : '失败') + '\\n**ASIN:** ' + (state.asin || 'N/A') + '\\n**状态:** ' + state.status + '\\n**视觉分析:** ' + (state.visualStatus || 'not_run') + (state.errorMessage ? '\\n**错误:** ' + String(state.errorMessage).slice(0, 300) : '') + link; return [{ json: { ...state, message, channelId: state.channelId, mattermostBaseUrl: state.mattermostBaseUrl, props: { runId: state.runId, workflow: 'amazon-listing-audit-v2' } } }];`);
  const notify = executeWorkflowNode('Send Mattermost completion notification', [5248, -64], MATTERMOST_WORKFLOW_ID, '[组件] Send Mattermost notification', true, { onError: 'continueRegularOutput' });
  const attachNotify = codeNode('Attach notification result', [5472, -64], `const base = $('Restore final listing audit result').first().json || {}; const notification = $input.first().json || {}; const notifyStatus = notification.ok === false || notification.error ? 'failed' : 'success'; const runRow = { ...(base.runRow || {}), notifyStatus, lastUpdatedAt: new Date().toISOString() }; return [{ json: { ...base, notification, notifyStatus, runRow } }];`);
  const persistNotify = upsertRunNode('Persist Mattermost notification status', [5696, -64], tableId);
  const restoreNotify = codeNode('Restore worker after notification status', [5920, -64], `return [{ json: $('Attach notification result').first().json || {} }];`);
  const done = codeNode('Return listing audit worker result', [6144, 32], `const state = $input.first().json || {}; return [{ json: { ok: ['success','partial'].includes(state.status), runId: state.runId, asin: state.asin, status: state.status, phase: state.phase, visualStatus: state.visualStatus, publishStatus: state.publishStatus, htmlReportUrl: state.htmlReportUrl || '', htmlArchiveUrl: state.htmlArchiveUrl || '', errorType: state.errorType || '', errorMessage: state.errorMessage || '', notifyStatus: state.notifyStatus || 'disabled', audit: state.audit || null, listing: state.listing || null, notification: state.notification || null } }];`);
  const nodes = [
    sticky('Worker architecture', [-1248, -240], '## Amazon Listing Audit worker v2\n\nFetch -> visual evidence -> strict JSON audit -> deterministic HTML -> run state -> Mattermost. Failures remain explicit and never masquerade as complete reports.', 700, 260),
    trigger, initialize, upsertRunning, restore, fetch, attachListing, hasListing, prepareVisual, hasImages, analyzeVisual, skipVisual, assembleVisual,
    prepareAudit, primaryAi, validate, shouldRetry, prepareRetry, retryAi, validateRetry, finalize, auditValid, shouldPublish,
    preparePublish, publish, attachPublish, skipPublish, listingFailure, buildFinal, upsertFinal, restoreFinal, shouldNotify,
    prepareNotify, notify, attachNotify, persistNotify, restoreNotify, done,
  ];
  const connections = {
    'When called to run listing audit': main('Initialize worker state'),
    'Initialize worker state': main('Upsert listing audit running'),
    'Upsert listing audit running': main('Restore worker context'),
    'Restore worker context': main('Fetch normalized Amazon listing'),
    'Fetch normalized Amazon listing': main('Attach listing fetch result'),
    'Attach listing fetch result': main('Has usable listing?'),
    'Has usable listing?': { main: [[{ node: 'Prepare visual analysis', type: 'main', index: 0 }], [{ node: 'Build listing fetch failure', type: 'main', index: 0 }]] },
    'Prepare visual analysis': main('Has images to analyze?'),
    'Has images to analyze?': { main: [[{ node: 'Analyze listing images with Gemini', type: 'main', index: 0 }], [{ node: 'Skip unavailable visual analysis', type: 'main', index: 0 }]] },
    'Analyze listing images with Gemini': main('Assemble visual analysis'),
    'Assemble visual analysis': main('Prepare audit request'),
    'Skip unavailable visual analysis': main('Prepare audit request'),
    'Prepare audit request': main('Generate strict listing audit JSON'),
    'Generate strict listing audit JSON': main('Validate audit JSON'),
    'Validate audit JSON': main('Should retry invalid audit JSON?'),
    'Should retry invalid audit JSON?': { main: [[{ node: 'Prepare compact audit retry', type: 'main', index: 0 }], [{ node: 'Finalize audit result', type: 'main', index: 0 }]] },
    'Prepare compact audit retry': main('Retry strict listing audit JSON'),
    'Retry strict listing audit JSON': main('Validate retry audit JSON'),
    'Validate retry audit JSON': main('Finalize audit result'),
    'Finalize audit result': main('Audit JSON valid?'),
    'Audit JSON valid?': { main: [[{ node: 'Should publish HTML?', type: 'main', index: 0 }], [{ node: 'Build final listing audit row', type: 'main', index: 0 }]] },
    'Should publish HTML?': { main: [[{ node: 'Prepare listing HTML publish input', type: 'main', index: 0 }], [{ node: 'Skip HTML publish', type: 'main', index: 0 }]] },
    'Prepare listing HTML publish input': main('Publish listing audit HTML'),
    'Publish listing audit HTML': main('Attach HTML publish result'),
    'Attach HTML publish result': main('Build final listing audit row'),
    'Skip HTML publish': main('Build final listing audit row'),
    'Build listing fetch failure': main('Build final listing audit row'),
    'Build final listing audit row': main('Upsert final listing audit run'),
    'Upsert final listing audit run': main('Restore final listing audit result'),
    'Restore final listing audit result': main('Should notify Mattermost?'),
    'Should notify Mattermost?': { main: [[{ node: 'Prepare Mattermost completion message', type: 'main', index: 0 }], [{ node: 'Return listing audit worker result', type: 'main', index: 0 }]] },
    'Prepare Mattermost completion message': main('Send Mattermost completion notification'),
    'Send Mattermost completion notification': main('Attach notification result'),
    'Attach notification result': main('Persist Mattermost notification status'),
    'Persist Mattermost notification status': main('Restore worker after notification status'),
    'Restore worker after notification status': main('Return listing audit worker result'),
  };
  return { name: NAMES.worker, description: 'Amazon Listing Audit v2 后台 Worker。以显式状态执行抓取、视觉分析、严格 JSON 审计、MinIO HTML 发布和 Mattermost 完成通知。', nodes, connections, settings: workflowSettings(1200) };
}

function buildStartWorkflow({ workerId, tableId }) {
  const trigger = triggerNode('When called to start listing audit', [-800, 96], [
    { name: 'productUrl' }, { name: 'asin' }, { name: 'marketplace' }, { name: 'listingLocale' }, { name: 'reportLanguage' },
    { name: 'targetAudience' }, { name: 'positioning' }, { name: 'focus' }, { name: 'cacheMode' },
    { name: 'publishHtml', type: 'boolean' }, { name: 'notifyMattermost', type: 'boolean' }, { name: 'channelId' },
    { name: 'mattermostBaseUrl' }, { name: 'requestedBy' }, { name: 'dryRun', type: 'boolean' },
  ]);
  const normalize = codeNode('Normalize and validate Amazon listing request', [-576, 96], normalizeInputCode.trim());
  const valid = ifNode('Request valid?', [-352, 96], '={{ $json.valid === true }}');
  const upsert = upsertRunNode('Upsert queued listing audit run', [-128, 0], tableId);
  const restore = codeNode('Restore normalized start request', [96, 0], `return [{ json: $('Normalize and validate Amazon listing request').first().json || {} }];`);
  const runWorker = executeWorkflowNode('Start listing audit worker asynchronously', [320, 0], workerId, NAMES.worker, false);
  const ack = codeNode('Return queued acknowledgement', [544, 0], `const state = $('Restore normalized start request').first().json || {}; return [{ json: { ok: true, accepted: true, runId: state.runId, asin: state.asin, productUrl: state.productUrl, status: 'queued', message: 'Amazon Listing 审计任务已受理，可使用 runId 查询进度。' } }];`);
  const rejected = codeNode('Return validation error', [-128, 192], `const state = $input.first().json || {}; return [{ json: { ok: false, accepted: false, status: 'rejected', error: 'invalid_input', validationErrors: state.validationErrors || [], message: (state.validationErrors || []).join('; ') } }];`);
  return {
    name: NAMES.start,
    description: '快速启动 Amazon Listing Audit v2。确定性校验 ASIN/站点，写入 queued 运行记录并异步启动后台 Worker。',
    nodes: [sticky('Start contract', [-800, -208], '## Fast asynchronous entry\n\nValidates without AI, writes a queued run, starts the worker without waiting, and immediately returns runId.', 620, 220), trigger, normalize, valid, upsert, restore, runWorker, ack, rejected],
    connections: {
      'When called to start listing audit': main('Normalize and validate Amazon listing request'),
      'Normalize and validate Amazon listing request': main('Request valid?'),
      'Request valid?': { main: [[{ node: 'Upsert queued listing audit run', type: 'main', index: 0 }], [{ node: 'Return validation error', type: 'main', index: 0 }]] },
      'Upsert queued listing audit run': main('Restore normalized start request'),
      'Restore normalized start request': main('Start listing audit worker asynchronously'),
      'Start listing audit worker asynchronously': main('Return queued acknowledgement'),
    },
    settings: workflowSettings(60),
  };
}

function buildQueryWorkflow(tableId) {
  const trigger = triggerNode('When called to query listing audit', [-448, 80], [{ name: 'runId' }]);
  const normalize = codeNode('Normalize run query', [-224, 80], `const runId = String($input.first().json?.runId || '').trim(); if (!runId) throw new Error('runId is required'); return [{ json: { runId } }];`);
  const get = getRunNode('Get listing audit run', [0, 80], tableId);
  const format = codeNode('Format listing audit query result', [224, 80], `const row = $input.first().json || {}; const parse = (value) => { if (!value) return null; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return null; } }; if (!row.runId) return [{ json: { ok: false, status: 'not_found', message: '未找到对应的 Listing 审计任务' } }]; return [{ json: { ok: true, runId: row.runId, asin: row.asin, productUrl: row.productUrl, marketplace: row.marketplace, status: row.status, phase: row.phase, visualStatus: row.visualStatus, publishStatus: row.publishStatus, htmlReportUrl: row.htmlReportUrl || '', htmlArchiveUrl: row.htmlArchiveUrl || '', title: row.title || '', brand: row.brand || '', errorType: row.errorType || '', errorMessage: row.errorMessage || '', startedAt: row.startedAt, lastUpdatedAt: row.lastUpdatedAt, finishedAt: row.finishedAt, audit: parse(row.auditJson_object), listing: parse(row.listingJson_object) } }];`);
  return { name: NAMES.query, description: '按 runId 查询 Amazon Listing Audit v2 的状态、错误、结构化审计和 HTML 报告链接。', nodes: [trigger, normalize, get, format], connections: { 'When called to query listing audit': main('Normalize run query'), 'Normalize run query': main('Get listing audit run'), 'Get listing audit run': main('Format listing audit query result') }, settings: workflowSettings(60) };
}

function buildWrapperWorkflow({ startId, queryId, credentialId }) {
  const webhook = node('Amazon listing audit API', 'n8n-nodes-base.webhook', 2.1, [-720, 80], {
    httpMethod: 'POST', path: WEBHOOK_PATH, authentication: 'headerAuth', responseMode: 'responseNode',
    options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }] } },
  }, {
    webhookId: '7f31c9d4-2efe-4a55-bf93-6fe3ef9307f1',
    credentials: { httpHeaderAuth: { id: credentialId, name: WEBHOOK_CREDENTIAL_NAME } },
  });
  const normalize = codeNode('Normalize API action', [-496, 80], `const source = $input.first().json || {}; const body = source.body && typeof source.body === 'object' ? source.body : {}; const action = String(body.action || source.action || 'start').trim().toLowerCase(); return [{ json: { ...source, ...body, action: action === 'query' ? 'query' : 'start' } }];`);
  const queryAction = ifNode('Query action?', [-272, 80], '={{ $json.action === "query" }}');
  const start = executeWorkflowNode('Start Amazon listing audit', [-48, 0], startId, NAMES.start, true);
  const query = executeWorkflowNode('Query Amazon listing audit', [-48, 160], queryId, NAMES.query, true);
  const respondStart = node('Respond with start acknowledgement', 'n8n-nodes-base.respondToWebhook', 1.5, [176, 0], {
    respondWith: 'json', responseBody: '={{ $json }}',
    options: { responseCode: '={{ $json.accepted === true ? 202 : 400 }}', responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }] } },
  });
  const respondQuery = node('Respond with query result', 'n8n-nodes-base.respondToWebhook', 1.5, [176, 160], {
    respondWith: 'json', responseBody: '={{ $json }}',
    options: { responseCode: '={{ $json.ok === true ? 200 : 404 }}', responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }] } },
  });
  return {
    name: NAMES.wrapper,
    description: '受 Header Auth 保护的 Amazon Listing Audit v2 Webhook/MCP 入口。action=start 异步启动，action=query 查询 runId。',
    nodes: [sticky('API contract', [-720, -232], '## Authenticated asynchronous API\n\nPOST action=start for a fast 202 acknowledgement. POST action=query with runId for status and report links. Header authentication is stored only in n8n Credentials.', 620, 230), webhook, normalize, queryAction, start, query, respondStart, respondQuery],
    connections: {
      'Amazon listing audit API': main('Normalize API action'),
      'Normalize API action': main('Query action?'),
      'Query action?': { main: [[{ node: 'Query Amazon listing audit', type: 'main', index: 0 }], [{ node: 'Start Amazon listing audit', type: 'main', index: 0 }]] },
      'Start Amazon listing audit': main('Respond with start acknowledgement'),
      'Query Amazon listing audit': main('Respond with query result'),
    },
    settings: { ...workflowSettings(90), availableInMCP: true },
  };
}

function validateWorkflow(workflow) {
  const names = workflow.nodes.map((entry) => entry.name);
  if (new Set(names).size !== names.length) throw new Error(`${workflow.name}: duplicate node names`);
  const known = new Set(names);
  for (const [source, groups] of Object.entries(workflow.connections || {})) {
    if (!known.has(source)) throw new Error(`${workflow.name}: unknown connection source ${source}`);
    for (const outputs of Object.values(groups)) for (const branch of outputs || []) for (const edge of branch || []) {
      if (!known.has(edge.node)) throw new Error(`${workflow.name}: unknown connection target ${edge.node}`);
    }
  }
  const serialized = JSON.stringify(workflow);
  for (const pattern of [/const\s+mmToken\s*=/i, /const\s+AUTH\s*=/i, /Authorization['"]?\s*:\s*['"]Bearer\s+[A-Za-z0-9._-]+/i]) {
    if (pattern.test(serialized)) throw new Error(`${workflow.name}: plaintext credential pattern ${pattern}`);
  }
}

async function listAll(pathname) {
  const result = await api(pathname);
  return result.data || [];
}

async function ensureRunTable() {
  const tables = await listAll('/data-tables?limit=100');
  const existing = tables.find((table) => table.name === RUN_TABLE_NAME);
  if (existing) {
    if (APPLY) {
      const known = new Set((existing.columns || []).map((column) => column.name));
      for (const [name, type] of runColumns) {
        if (known.has(name)) continue;
        await api(`/data-tables/${existing.id}/columns`, { method: 'POST', body: { name, type } });
        known.add(name);
      }
      const refreshed = await listAll(`/data-tables?limit=100&filter=${encodeURIComponent(JSON.stringify({ name: RUN_TABLE_NAME }))}`);
      return refreshed.find((table) => table.id === existing.id) || existing;
    }
    return existing;
  }
  if (!APPLY) return { id: '__AMAZON_LISTING_AUDIT_RUNS__', name: RUN_TABLE_NAME, preview: true };
  const created = await api('/data-tables', { method: 'POST', body: { name: RUN_TABLE_NAME, columns: runColumns.slice(0, 2).map(([name, type]) => ({ name, type })) } });
  const known = new Set((created.columns || []).map((column) => column.name));
  for (const [name, type] of runColumns) {
    if (known.has(name)) continue;
    await api(`/data-tables/${created.id}/columns`, { method: 'POST', body: { name, type } });
    known.add(name);
  }
  return created;
}

async function workflowByName(name) {
  const result = await api(`/workflows?name=${encodeURIComponent(name)}&limit=20`);
  return (result.data || []).find((workflow) => workflow.name === name && !workflow.isArchived) || null;
}

async function ensureWebhookCredential() {
  const credentials = await listAll('/credentials?limit=250');
  const existing = credentials.find((credential) => credential.name === WEBHOOK_CREDENTIAL_NAME && credential.type === 'httpHeaderAuth');
  if (existing) return { ...existing, secret: '' };
  if (!APPLY) return { id: '__AMAZON_LISTING_AUDIT_WEBHOOK_AUTH__', name: WEBHOOK_CREDENTIAL_NAME, type: 'httpHeaderAuth', secret: '' };
  throw new Error(`Create an n8n Header Auth credential named ${WEBHOOK_CREDENTIAL_NAME} before provisioning.`);
}

async function upsertWorkflow(workflow) {
  validateWorkflow(workflow);
  const existing = await workflowByName(workflow.name);
  const nodes = workflow.nodes.map((current) => {
    const previous = existing?.nodes?.find((candidate) => candidate.name === current.name);
    return previous ? { ...current, id: previous.id, ...(previous.webhookId ? { webhookId: previous.webhookId } : {}) } : current;
  });
  const payload = { name: workflow.name, description: workflow.description, nodes, connections: workflow.connections, settings: workflow.settings };
  if (!APPLY) return { ...(existing || {}), id: existing?.id || `__${workflow.name.replace(/\W+/g, '_')}__`, preview: true, payload };
  if (existing) return api(`/workflows/${existing.id}`, { method: 'PUT', body: payload });
  const created = await api('/workflows', {
    method: 'POST',
    body: { name: payload.name, nodes: payload.nodes, connections: payload.connections, settings: payload.settings, projectId: PROJECT_ID },
  });
  return api(`/workflows/${created.id}`, { method: 'PUT', body: payload });
}

const sourceItemWorkflow = await api(`/workflows/${SOURCE_ITEM_WORKFLOW_ID}`);
const runTable = await ensureRunTable();
const webhookCredential = await ensureWebhookCredential();
const builds = [];
const fetchWorkflow = await upsertWorkflow(buildFetchWorkflow(sourceItemWorkflow)); builds.push(fetchWorkflow);
const gatewayWorkflow = await upsertWorkflow(buildReportGatewayWorkflow()); builds.push(gatewayWorkflow);
const publisherWorkflow = await upsertWorkflow(buildPublisherWorkflow()); builds.push(publisherWorkflow);
const workerWorkflow = await upsertWorkflow(buildWorkerWorkflow({ fetchId: fetchWorkflow.id, publisherId: publisherWorkflow.id, tableId: runTable.id })); builds.push(workerWorkflow);
const startWorkflow = await upsertWorkflow(buildStartWorkflow({ workerId: workerWorkflow.id, tableId: runTable.id })); builds.push(startWorkflow);
const queryWorkflow = await upsertWorkflow(buildQueryWorkflow(runTable.id)); builds.push(queryWorkflow);
const wrapperWorkflow = await upsertWorkflow(buildWrapperWorkflow({ startId: startWorkflow.id, queryId: queryWorkflow.id, credentialId: webhookCredential.id })); builds.push(wrapperWorkflow);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('tmp/n8n-previews', `${stamp}-amazon-listing-audit-v2`);
await mkdir(outputDir, { recursive: true });
for (const workflow of builds) {
  const output = workflow.payload || workflow;
  await writeFile(path.join(outputDir, `${workflow.id}__${safeName(output.name)}.json`), JSON.stringify(output, null, 2));
}
await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ apply: APPLY, publish: PUBLISH, runTable: { id: runTable.id, name: runTable.name }, webhookCredential: { id: webhookCredential.id, name: webhookCredential.name }, workflows: builds.map((workflow) => ({ id: workflow.id, name: workflow.name || workflow.payload?.name, active: workflow.active ?? false })) }, null, 2));

if (APPLY) {
  for (const created of builds) {
    const verified = await api(`/workflows/${created.id}`);
    validateWorkflow(verified);
    if (!PUBLISH && verified.active) throw new Error(`${verified.name}: apply without --publish must remain inactive`);
  }
}

if (APPLY && PUBLISH) {
  for (const created of builds) {
    const current = await api(`/workflows/${created.id}`);
    if (!current.active) await api(`/workflows/${created.id}/activate`, { method: 'POST' });
  }
  for (const created of builds) {
    const verified = await api(`/workflows/${created.id}`);
    if (!verified.active) throw new Error(`${verified.name}: activation verification failed`);
  }
}

let smokeTest = null;
if (APPLY && PUBLISH && SMOKE_TEST) {
  if (!WEBHOOK_TEST_SECRET) throw new Error('AMAZON_LISTING_AUDIT_WEBHOOK_KEY is required for an authenticated smoke test.');
  const callWebhook = async (body) => {
    const started = Date.now();
    const response = await fetch(`${BASE_URL}/webhook/${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [WEBHOOK_HEADER_NAME]: WEBHOOK_TEST_SECRET },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { statusCode: response.status, latencyMs: Date.now() - started, data };
  };
  const invalid = await callWebhook({ action: 'start', productUrl: 'https://www.amazon.evil/dp/B0DPHNQKT5' });
  if (invalid.statusCode !== 400 || invalid.data?.accepted !== false) throw new Error(`Invalid-input smoke test failed: ${JSON.stringify(invalid)}`);
  const started = await callWebhook({
    action: 'start', productUrl: 'https://www.amazon.co.jp/dp/B0DPHNQKT5', reportLanguage: 'zh-CN',
    cacheMode: 'prefer_cache', publishHtml: true, notifyMattermost: false, dryRun: false,
  });
  if (started.statusCode !== 202 || !started.data?.runId) throw new Error(`Start smoke test failed: ${JSON.stringify(started)}`);
  const runId = started.data.runId;
  const terminal = new Set(['success', 'partial', 'failed', 'rejected']);
  let row = null;
  const deadline = Date.now() + 420000;
  while (Date.now() < deadline) {
    const filter = { type: 'and', filters: [{ columnName: 'runId', condition: 'eq', value: runId }] };
    const rows = await api(`/data-tables/${runTable.id}/rows?limit=1&filter=${encodeURIComponent(JSON.stringify(filter))}`);
    row = rows.data?.[0] || rows[0] || null;
    if (row && terminal.has(row.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!row || !terminal.has(row.status)) throw new Error(`Listing audit smoke test timed out: ${runId}`);
  const queried = await callWebhook({ action: 'query', runId });
  if (queried.statusCode !== 200 || queried.data?.runId !== runId) throw new Error(`Query smoke test failed: ${JSON.stringify(queried)}`);
  if (!['success', 'partial'].includes(row.status)) throw new Error(`Listing audit smoke test ended ${row.status}: ${row.errorType || ''} ${row.errorMessage || ''}`);
  if (!row.htmlReportUrl) throw new Error(`Listing audit smoke test produced no HTML report URL: ${runId}`);
  smokeTest = { invalidInputStatus: invalid.statusCode, acknowledgementLatencyMs: started.latencyMs, runId, status: row.status, visualStatus: row.visualStatus, publishStatus: row.publishStatus, htmlReportUrl: row.htmlReportUrl, queryStatus: queried.statusCode };
}

console.log(JSON.stringify({
  ok: true,
  apply: APPLY,
  publish: PUBLISH,
  outputDir,
  runTable: { id: runTable.id, name: runTable.name },
  workflows: builds.map((workflow) => ({ id: workflow.id, name: workflow.name || workflow.payload?.name, active: workflow.active ?? false })),
  smokeTest,
}, null, 2));

function safeName(value) {
  return String(value || 'workflow').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'workflow';
}
