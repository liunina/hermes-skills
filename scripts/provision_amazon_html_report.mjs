#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const BASE_URL = (process.env.N8N_BASE_URL || 'https://workflow.dinve.com').replace(/\/+$/, '');
const API_KEY = process.env.N8N_API_KEY;
const ORCHESTRATOR_ID = '3WraKTwcR36ddo50';
const WRAPPER_ID = 'NTmsqggT3pjv50Qf';
const QUERY_ID = 'vh8BqtBJMLgf3OEZ';
const S3_CREDENTIAL_ID = 'Ssmp3PXE3qSUYB6m';
const PUBLISHER_NAME = '[子工作流] Publish Amazon competitor HTML report';
const BUCKET = 'amazon-reports';

if (!API_KEY) throw new Error('N8N_API_KEY is required.');

const here = path.dirname(fileURLToPath(import.meta.url));
const referenceDir = path.resolve(here, '../skills/amazon-competitor-analysis/references/html-report');
const readReference = (name, encoding = 'utf8') => readFile(path.join(referenceDir, name), encoding);
const [prepareImagesCode, buildBinariesCode, generateArtifactsSource, returnCode, cssV1, cssV2, jsV2, iconsV2, font400, font600, font700] = await Promise.all([
  readReference('prepare-image-tasks.js'),
  readReference('build-image-binaries.js'),
  readReference('generate-artifacts.js'),
  readReference('return-publish-result.js'),
  readReference('report-v1.css'),
  readReference('report-v2.css'),
  readReference('assets/js/report-v2.js'),
  readReference('assets/icons/report-icons.svg'),
  readReference('assets/fonts/inter-latin-400.woff2', 'base64'),
  readReference('assets/fonts/inter-latin-600.woff2', 'base64'),
  readReference('assets/fonts/inter-latin-700.woff2', 'base64'),
]);
const generateArtifactsCode = `const REPORT_CSS_V1 = ${JSON.stringify(cssV1)};\nconst REPORT_CSS_V2 = ${JSON.stringify(cssV2)};\nconst REPORT_JS = ${JSON.stringify(jsV2)};\nconst REPORT_ICONS = ${JSON.stringify(iconsV2)};\nconst REPORT_FONTS = [${JSON.stringify(font400)}, ${JSON.stringify(font600)}, ${JSON.stringify(font700)}];\n${generateArtifactsSource}`;

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
  if (!response.ok) throw new Error(`${method} ${pathname} failed (${response.status}): ${text.slice(0, 1000)}`);
  return data;
}

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: extra.id || randomUUID(),
  name,
  type,
  typeVersion,
  position,
  parameters,
  ...extra,
});

function buildPublisherWorkflow(existingId = '') {
  const trigger = node('When called by orchestrator', 'n8n-nodes-base.executeWorkflowTrigger', 1.2, [-920, 80], {
    workflowInputs: {
      values: [
        { name: 'runId' },
        { name: 'ownAsin' },
        { name: 'title' },
        { name: 'markdown' },
        { name: 'wikiPath' },
        { name: 'wikiLink' },
        { name: 'reportInput', type: 'object' },
        { name: 'reportQa', type: 'object' },
        { name: 'reportVersion' },
        { name: 's3Bucket' },
        { name: 's3Prefix' },
        { name: 'endpointBaseUrl' },
        { name: 'publicBaseUrl' },
        { name: 'shortBaseUrl' },
        { name: 'useShortUrl', type: 'boolean' },
        { name: 'styleVersion' },
        { name: 'maxProductImages', type: 'number' },
        { name: 'maxAplusImages', type: 'number' },
      ],
    },
  }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa01' });
  const note = node('HTML publisher architecture note', 'n8n-nodes-base.stickyNote', 1, [-1000, -320], {
    content: '## Amazon competitor HTML publisher\nCaches selected Listing/A+ images to MinIO, generates responsive HTML + shared CSS + JSON manifest/data, uploads latest and immutable run snapshots, and returns artifact URLs. A failed image download becomes a visible placeholder and does not stop the report.',
    height: 250,
    width: 930,
    color: 6,
  }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa02' });
  const prepare = node('Prepare image tasks', 'n8n-nodes-base.code', 2, [-680, 80], { jsCode: prepareImagesCode, mode: 'runOnceForAllItems' }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa03' });
  const download = node('Download source images', 'n8n-nodes-base.httpRequest', 4.4, [-440, 80], {
    url: '={{ $json.sourceUrl }}',
    options: {
      timeout: 45000,
      response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
    },
  }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa04', onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 });
  const binaries = node('Build image binaries', 'n8n-nodes-base.code', 2, [-200, 80], { jsCode: buildBinariesCode, mode: 'runOnceForAllItems' }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa05' });
  const uploadImages = node('Upload images to MinIO', 'n8n-nodes-base.s3', 1, [40, 80], {
    resource: 'file',
    operation: 'upload',
    bucketName: BUCKET,
    fileName: '={{ $json.s3Key }}',
    binaryData: true,
    binaryPropertyName: 'data',
    additionalFields: {},
  }, {
    id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa06',
    credentials: { s3: { id: S3_CREDENTIAL_ID, name: 'MinIO S3 - Amazon Reports' } },
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  });
  const generate = node('Generate report artifacts', 'n8n-nodes-base.code', 2, [280, 80], { jsCode: generateArtifactsCode, mode: 'runOnceForAllItems' }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa07' });
  const uploadArtifacts = node('Upload report artifacts to MinIO', 'n8n-nodes-base.s3', 1, [520, 80], {
    resource: 'file',
    operation: 'upload',
    bucketName: BUCKET,
    fileName: '={{ $json.s3Key }}',
    binaryData: true,
    binaryPropertyName: 'data',
    additionalFields: {},
  }, {
    id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa08',
    credentials: { s3: { id: S3_CREDENTIAL_ID, name: 'MinIO S3 - Amazon Reports' } },
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  });
  const done = node('Return HTML artifact links', 'n8n-nodes-base.code', 2, [760, 80], { jsCode: returnCode, mode: 'runOnceForAllItems' }, { id: '4e1b9a16-2914-48f7-9f23-c2bda3e8aa09' });
  const main = (target) => ({ main: [[{ node: target, type: 'main', index: 0 }]] });
  return {
    ...(existingId ? { id: existingId } : {}),
    name: PUBLISHER_NAME,
    nodes: [note, trigger, prepare, download, binaries, uploadImages, generate, uploadArtifacts, done],
    connections: {
      'When called by orchestrator': main('Prepare image tasks'),
      'Prepare image tasks': main('Download source images'),
      'Download source images': main('Build image binaries'),
      'Build image binaries': main('Upload images to MinIO'),
      'Upload images to MinIO': main('Generate report artifacts'),
      'Generate report artifacts': main('Upload report artifacts to MinIO'),
      'Upload report artifacts to MinIO': main('Return HTML artifact links'),
    },
    settings: { executionOrder: 'v1' },
  };
}

const hasInput = (triggerNode, name) => triggerNode.parameters?.workflowInputs?.values?.some((entry) => entry.name === name);
const addInput = (triggerNode, name, type) => {
  if (!hasInput(triggerNode, name)) triggerNode.parameters.workflowInputs.values.push({ name, ...(type ? { type } : {}) });
};
const insertOnce = (source, needle, replacement) => source.includes(replacement.trim()) ? source : source.replace(needle, replacement);
const nodeByName = (workflow, name) => {
  const found = workflow.nodes.find((entry) => entry.name === name);
  if (!found) throw new Error(`Node not found: ${name}`);
  return found;
};

function patchOrchestrator(workflow, publisherId) {
  const w = structuredClone(workflow);
  const trigger = nodeByName(w, 'When called by MCP or workflow');
  for (const [name, type] of [
    ['publishHtml', 'boolean'], ['htmlEndpointBaseUrl'], ['htmlS3Bucket'], ['htmlS3Prefix'], ['htmlPublicBaseUrl'], ['htmlShortBaseUrl'], ['htmlUseShortUrl', 'boolean'], ['htmlStyleVersion'], ['htmlMaxProductImages', 'number'], ['htmlMaxAplusImages', 'number'],
  ]) addInput(trigger, name, type);

  const normalize = nodeByName(w, 'Normalize batch input');
  const baseNormalizeLine = "const mode = clean(payload.mode) || 'hybrid'; const startedAt = new Date().toISOString(); const dryRun = bool(payload.dryRun, true); const publishWiki = bool(payload.publishWiki, false) && !dryRun; const publishItemWiki = bool(payload.publishItemWiki, publishWiki);";
  const htmlDeclaration = "const publishHtml = bool(payload.publishHtml, publishWiki) && !dryRun; const htmlEndpointBaseUrl = (clean(payload.htmlEndpointBaseUrl) || 'https://data.dinve.com').replace(/\\/+$/, ''); const htmlS3Bucket = clean(payload.htmlS3Bucket) || 'amazon-reports'; const htmlS3Prefix = (clean(payload.htmlS3Prefix) || 'amazon/competitor-analysis').replace(/^\\/+|\\/+$/g, ''); const htmlPublicBaseUrl = (clean(payload.htmlPublicBaseUrl) || (htmlEndpointBaseUrl + '/' + htmlS3Bucket)).replace(/\\/+$/, ''); const htmlShortBaseUrl = (clean(payload.htmlShortBaseUrl) || htmlEndpointBaseUrl).replace(/\\/+$/, ''); const htmlUseShortUrl = bool(payload.htmlUseShortUrl, true); const htmlStyleVersion = clean(payload.htmlStyleVersion) || 'v2'; const htmlMaxProductImages = Math.max(0, Math.min(8, Number(payload.htmlMaxProductImages ?? 5))); const htmlMaxAplusImages = Math.max(0, Math.min(8, Number(payload.htmlMaxAplusImages ?? 4)));";
  // Keep this patch idempotent. Older provisioning runs could append the HTML
  // declaration block repeatedly after normalizing htmlUseShortUrl.
  normalize.parameters.jsCode = normalize.parameters.jsCode
    .replace(/\nconst publishHtml = bool\(payload\.publishHtml[\s\S]*?htmlMaxAplusImages = Math\.max\(0, Math\.min\(8, Number\(payload\.htmlMaxAplusImages \?\? 4\)\)\);/g, '')
    .replace(baseNormalizeLine, baseNormalizeLine + '\n' + htmlDeclaration);
  normalize.parameters.jsCode = normalize.parameters.jsCode.replace(
    'return [{ json: { ...payload, runId, ownAsin, ownProductUrl, marketplace, locale, mode, dryRun, publishWiki, publishItemWiki, analyzeOwnListing, wikiPathPrefix: prefix, finalWikiPath, competitorCount: competitorTasks.length, expectedItemCount: tasks.length, tasks, runRow } }];',
    'return [{ json: { ...payload, runId, ownAsin, ownProductUrl, marketplace, locale, mode, dryRun, publishWiki, publishItemWiki, publishHtml, htmlEndpointBaseUrl, htmlS3Bucket, htmlS3Prefix, htmlPublicBaseUrl, htmlShortBaseUrl, htmlUseShortUrl, htmlStyleVersion, htmlMaxProductImages, htmlMaxAplusImages, analyzeOwnListing, wikiPathPrefix: prefix, finalWikiPath, competitorCount: competitorTasks.length, expectedItemCount: tasks.length, tasks, runRow } }];'
  );

  const existingNames = new Set(w.nodes.map((entry) => entry.name));
  const installingHtmlNodes = !existingNames.has('Should publish HTML?');
  const htmlNodes = [
    node('Should publish HTML?', 'n8n-nodes-base.if', 2.3, [2352, 336], {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'publish-html', leftValue: '={{ $json.publishHtml === true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
    }, { id: 'e07ecdc2-e0ea-4096-b02c-0beec58bb101' }),
    node('Prepare HTML publish input', 'n8n-nodes-base.code', 2, [2576, 240], {
      jsCode: "const out = $input.first().json || {}; return [{ json: { runId: out.runId || out.reportInput?.runId, ownAsin: out.ownAsin || out.reportInput?.ownAsin, title: out.title, markdown: out.markdown, wikiPath: out.wikiPath, wikiLink: out.wikiLink || '', reportInput: out.reportInput || {}, reportQa: out.reportQa || {}, reportVersion: out.reportVersion || '', s3Bucket: out.htmlS3Bucket || 'amazon-reports', s3Prefix: out.htmlS3Prefix || 'amazon/competitor-analysis', endpointBaseUrl: out.htmlEndpointBaseUrl || 'https://data.dinve.com', publicBaseUrl: out.htmlPublicBaseUrl || 'https://data.dinve.com/amazon-reports', shortBaseUrl: out.htmlShortBaseUrl || 'https://data.dinve.com', useShortUrl: out.htmlUseShortUrl === true, styleVersion: out.htmlStyleVersion || 'v2', maxProductImages: out.htmlMaxProductImages ?? 5, maxAplusImages: out.htmlMaxAplusImages ?? 4 } }];",
      mode: 'runOnceForAllItems',
    }, { id: 'e07ecdc2-e0ea-4096-b02c-0beec58bb102' }),
    node('Publish HTML report', 'n8n-nodes-base.executeWorkflow', 1.1, [2800, 240], {
      workflowId: { __rl: true, value: publisherId, mode: 'list', cachedResultUrl: `/workflow/${publisherId}`, cachedResultName: PUBLISHER_NAME },
      mode: 'each',
      options: { waitForSubWorkflow: true },
    }, { id: 'e07ecdc2-e0ea-4096-b02c-0beec58bb103', onError: 'continueRegularOutput' }),
    node('Attach HTML report link', 'n8n-nodes-base.code', 2, [3024, 240], {
      jsCode: "const base = $('Format final report').first().json || {}; const pub = $input.first().json || {}; const htmlReportUrl = pub.htmlReportUrl || ''; const htmlArchiveUrl = pub.htmlArchiveUrl || ''; const visualLine = htmlReportUrl ? ('- 可视化 HTML 报告: ' + htmlReportUrl + '\\n') : ''; const archiveLine = htmlArchiveUrl ? ('- 本次 HTML 归档: ' + htmlArchiveUrl + '\\n') : ''; let markdown = base.markdown || ''; const insertion = (markdown.includes('可视化 HTML 报告:') ? '' : visualLine) + (markdown.includes('本次 HTML 归档:') ? '' : archiveLine); if (insertion) { const marker = '- QA: ' + (base.reportQa?.passed ? 'passed' : 'blocked') + '\\n'; markdown = markdown.includes(marker) ? markdown.replace(marker, marker + insertion) : insertion + '\\n' + markdown; } let rowInput = {}; try { rowInput = JSON.parse(base.row?.inputJson_object || '{}'); } catch {} rowInput.htmlArtifact = pub; const row = { ...(base.row || {}), inputJson_object: JSON.stringify(rowInput) }; return [{ json: { ...base, ...pub, row, markdown, htmlReportUrl, htmlArchiveUrl, htmlPublishStatus: pub.htmlPublishStatus || (pub.ok ? 'success' : 'failed'), htmlPublishError: pub.htmlPublishError || '' } }];",
      mode: 'runOnceForAllItems',
    }, { id: 'e07ecdc2-e0ea-4096-b02c-0beec58bb104' }),
    node('Skip HTML publish', 'n8n-nodes-base.code', 2, [3024, 432], {
      jsCode: "const base = $('Format final report').first().json || {}; return [{ json: { ...base, htmlPublishStatus: base.dryRun ? 'dry_run' : 'disabled', htmlPublishError: '', htmlReportUrl: '', htmlArchiveUrl: '', artifacts: [] } }];",
      mode: 'runOnceForAllItems',
    }, { id: 'e07ecdc2-e0ea-4096-b02c-0beec58bb105' }),
  ];
  for (const htmlNode of htmlNodes) {
    const index = w.nodes.findIndex((entry) => entry.name === htmlNode.name);
    if (index === -1) w.nodes.push(htmlNode);
    else w.nodes[index] = { ...htmlNode, id: w.nodes[index].id };
  }

  const wikiShift = new Set(['Should publish final Wiki?', 'Prepare final Wiki publish input', 'Publish final Wiki report', 'Attach final Wiki link', 'Skip final Wiki publish', 'Upsert run final', 'Return orchestrator result']);
  if (installingHtmlNodes) for (const entry of w.nodes) if (wikiShift.has(entry.name)) entry.position[0] += 1120;

  nodeByName(w, 'Prepare final Wiki publish input').parameters.jsCode = "function ctx(){ try { const x=$('Attach HTML report link').first().json||{}; if(Object.keys(x).length) return x; } catch {} try { const x=$('Skip HTML publish').first().json||{}; if(Object.keys(x).length) return x; } catch {} return $('Format final report').first().json||{}; } const out=ctx(); return [{ json: { title: out.title, markdown: out.markdown, path: out.wikiPath, locale: 'zh', description: 'Amazon 竞品分析综合报告', tags: ['amazon','competitor','analysis'], sourceType: 'n8n-workflow', sourceUrl: out.htmlReportUrl || '', author: '[工具] Analyze Amazon competitors orchestrator v2' } }];";
  nodeByName(w, 'Attach final Wiki link').parameters.jsCode = "function ctx(){ try { const x=$('Attach HTML report link').first().json||{}; if(Object.keys(x).length) return x; } catch {} try { const x=$('Skip HTML publish').first().json||{}; if(Object.keys(x).length) return x; } catch {} return $('Format final report').first().json||{}; } const out=ctx(); const wiki=$input.first().json||{}; const row={...(out.row||{}),finalWikiLink:wiki.wikiLink||wiki.link||''}; return [{json:{...out,row,wikiPublish:wiki,wikiLink:row.finalWikiLink}}];";
  nodeByName(w, 'Skip final Wiki publish').parameters.jsCode = "function ctx(){ try { const x=$('Attach HTML report link').first().json||{}; if(Object.keys(x).length) return x; } catch {} try { const x=$('Skip HTML publish').first().json||{}; if(Object.keys(x).length) return x; } catch {} return $('Format final report').first().json||{}; } const out=ctx(); return [{json:{...out,wikiPublish:{ok:true,skipped:true,reason:out.dryRun?'dry_run':'disabled'},wikiLink:''}}];";
  const returnNode = nodeByName(w, 'Return orchestrator result');
  if (!returnNode.parameters.jsCode.includes('htmlReportUrl:')) {
    returnNode.parameters.jsCode = returnNode.parameters.jsCode.replace(
      "wikiPath: final.finalWikiPath || row.finalWikiPath || ri.finalWikiPath,",
      "wikiPath: final.finalWikiPath || row.finalWikiPath || ri.finalWikiPath,\n  htmlReportUrl: final.htmlReportUrl || null,\n  htmlArchiveUrl: final.htmlArchiveUrl || null,\n  htmlPublishStatus: final.htmlPublishStatus || 'disabled',\n  htmlPublishError: final.htmlPublishError || '',\n  artifacts: final.artifacts || [],"
    );
  }
  if (!returnNode.parameters.jsCode.includes('wikiArchiveLink:')) {
    returnNode.parameters.jsCode = returnNode.parameters.jsCode.replace(
      "wikiPath: final.finalWikiPath || row.finalWikiPath || ri.finalWikiPath,",
      "wikiPath: final.finalWikiPath || row.finalWikiPath || ri.finalWikiPath,\n  wikiArchiveLink: final.wikiArchiveLink || null,"
    );
  }

  w.connections['Format final report'] = { main: [[{ node: 'Should publish HTML?', type: 'main', index: 0 }]] };
  w.connections['Should publish HTML?'] = { main: [[{ node: 'Prepare HTML publish input', type: 'main', index: 0 }], [{ node: 'Skip HTML publish', type: 'main', index: 0 }]] };
  w.connections['Prepare HTML publish input'] = { main: [[{ node: 'Publish HTML report', type: 'main', index: 0 }]] };
  w.connections['Publish HTML report'] = { main: [[{ node: 'Attach HTML report link', type: 'main', index: 0 }]] };
  w.connections['Attach HTML report link'] = { main: [[{ node: 'Should publish final Wiki?', type: 'main', index: 0 }]] };
  w.connections['Skip HTML publish'] = { main: [[{ node: 'Should publish final Wiki?', type: 'main', index: 0 }]] };
  return w;
}

function patchWrapper(workflow) {
  const w = structuredClone(workflow);
  const validate = nodeByName(w, 'Validate and normalize request v2');
  if (!validate.parameters.jsCode.includes('publishHtml:')) {
    validate.parameters.jsCode = validate.parameters.jsCode.replace(
      "publishWiki: bool(body.publishWiki, false), publishItemWiki: bool(body.publishItemWiki, bool(body.publishWiki, false)), analyzeOwnListing:",
      "publishWiki: bool(body.publishWiki, false), publishItemWiki: bool(body.publishItemWiki, bool(body.publishWiki, false)), publishHtml: bool(body.publishHtml, bool(body.publishWiki, false)), htmlEndpointBaseUrl: (clean(body.htmlEndpointBaseUrl) || 'https://data.dinve.com').replace(/\\/+$/, ''), htmlS3Bucket: clean(body.htmlS3Bucket) || 'amazon-reports', htmlS3Prefix: (clean(body.htmlS3Prefix) || 'amazon/competitor-analysis').replace(/^\\/+|\\/+$/g, ''), htmlPublicBaseUrl: clean(body.htmlPublicBaseUrl) || 'https://data.dinve.com/amazon-reports', htmlShortBaseUrl: clean(body.htmlShortBaseUrl) || 'https://data.dinve.com', htmlUseShortUrl: bool(body.htmlUseShortUrl, false), htmlStyleVersion: clean(body.htmlStyleVersion) || 'v2', htmlMaxProductImages: Math.max(0, Math.min(8, Math.floor(num(body.htmlMaxProductImages, 5)))), htmlMaxAplusImages: Math.max(0, Math.min(8, Math.floor(num(body.htmlMaxAplusImages, 4)))), analyzeOwnListing:"
    );
  }
  validate.parameters.jsCode = validate.parameters.jsCode.replace(
    /bool\(body\.htmlUseShortUrl,\s*false\)/g,
    'bool(body.htmlUseShortUrl, true)'
  );
  return w;
}

function patchQuery(workflow) {
  const w = structuredClone(workflow);
  const aggregate = nodeByName(w, 'Aggregate query result');
  if (!aggregate.parameters.jsCode.includes('htmlReportUrl:')) {
    aggregate.parameters.jsCode = aggregate.parameters.jsCode.replace(
      "const computed = {",
      "const runInput = parseObject(run?.inputJson_object) || {}; const htmlArtifact = runInput.htmlArtifact || {};\nconst computed = {"
    ).replace(
      "finalWikiLink: run?.finalWikiLink || '',",
      "finalWikiLink: run?.finalWikiLink || '',\n  htmlReportUrl: htmlArtifact.htmlReportUrl || '',\n  htmlArchiveUrl: htmlArtifact.htmlArchiveUrl || '',\n  htmlPublishStatus: htmlArtifact.htmlPublishStatus || '',\n  htmlPublishError: htmlArtifact.htmlPublishError || '',\n  artifacts: htmlArtifact.artifacts || [],"
    );
  }
  if (!aggregate.parameters.jsCode.includes('wikiArchiveLink:')) {
    aggregate.parameters.jsCode = aggregate.parameters.jsCode.replace(
      "finalWikiLink: run?.finalWikiLink || '',",
      "finalWikiLink: run?.finalWikiLink || '',\n  wikiArchiveLink: runInput.wikiArchive?.wikiArchiveLink || '',"
    );
  }
  return w;
}

function minimalWorkflow(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    // The public n8n API rejects internal/UI-only settings such as
    // `availableInMCP` and `binaryMode` on workflow PUT requests. Keep the
    // update payload intentionally narrow so existing workflows can be
    // patched across n8n versions without a schema error.
    settings: {
      executionOrder: workflow.settings?.executionOrder || 'v1',
    },
  };
}

const list = await api('/workflows?limit=250');
const existingPublisher = (list.data || []).find((workflow) => workflow.name === PUBLISHER_NAME);
const publisherDraft = buildPublisherWorkflow(existingPublisher?.id || '');
const [orchestrator, wrapper, query] = await Promise.all([
  api(`/workflows/${ORCHESTRATOR_ID}`),
  api(`/workflows/${WRAPPER_ID}`),
  api(`/workflows/${QUERY_ID}`),
]);
const validateGraph = (workflow) => {
  const errors = [];
  const names = new Set(workflow.nodes.map((entry) => entry.name));
  if (names.size !== workflow.nodes.length) errors.push('duplicate node names');
  for (const [source, outputs] of Object.entries(workflow.connections || {})) {
    if (!names.has(source)) errors.push(`missing connection source: ${source}`);
    for (const lists of Object.values(outputs || {})) for (const list of lists || []) for (const target of list || []) if (!names.has(target.node)) errors.push(`missing connection target: ${source} -> ${target.node}`);
  }
  return errors;
};
const validateCodeSyntax = (workflow) => workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.code').flatMap((entry) => {
  try { new Function(entry.parameters?.jsCode || ''); return []; } catch (error) { return [`${entry.name}: ${error.message}`]; }
});
const dryRunDrafts = {
  publisher: publisherDraft,
  orchestrator: patchOrchestrator(orchestrator, existingPublisher?.id || 'PENDING_ID'),
  wrapper: patchWrapper(wrapper),
  query: patchQuery(query),
};
const validations = Object.fromEntries(Object.entries(dryRunDrafts).map(([name, workflow]) => [name, [...validateGraph(workflow), ...validateCodeSyntax(workflow)]]));
if (Object.values(validations).some((errors) => errors.length)) throw new Error(`Local workflow validation failed: ${JSON.stringify(validations)}`);

if (!APPLY) {
  console.log(JSON.stringify({
    apply: false,
    publisher: { existingId: existingPublisher?.id || null, nodeCount: publisherDraft.nodes.length },
    orchestrator: { id: orchestrator.id, beforeNodes: orchestrator.nodes.length, afterNodes: dryRunDrafts.orchestrator.nodes.length },
    wrapper: { id: wrapper.id },
    query: { id: query.id },
    validations,
  }, null, 2));
  process.exit(0);
}

const backupStamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(here, '../../tmp/n8n-backups', `${backupStamp}-amazon-html-publisher-before-apply`);
await mkdir(backupDir, { recursive: true });
const existingPublisherFull = existingPublisher ? await api(`/workflows/${existingPublisher.id}`) : null;
await Promise.all([
  writeFile(path.join(backupDir, `${ORCHESTRATOR_ID}__orchestrator.json`), JSON.stringify(orchestrator, null, 2)),
  writeFile(path.join(backupDir, `${WRAPPER_ID}__wrapper.json`), JSON.stringify(wrapper, null, 2)),
  writeFile(path.join(backupDir, `${QUERY_ID}__query.json`), JSON.stringify(query, null, 2)),
  ...(existingPublisherFull ? [writeFile(path.join(backupDir, `${existingPublisher.id}__html-publisher.json`), JSON.stringify(existingPublisherFull, null, 2))] : []),
]);

let publisher;
if (existingPublisher) {
  publisher = await api(`/workflows/${existingPublisher.id}`, { method: 'PUT', body: minimalWorkflow(publisherDraft) });
} else {
  publisher = await api('/workflows', { method: 'POST', body: minimalWorkflow(publisherDraft) });
}
try { await api(`/workflows/${publisher.id}/activate`, { method: 'POST', body: {} }); } catch {}

const patchedOrchestrator = patchOrchestrator(orchestrator, publisher.id);
const patchedWrapper = patchWrapper(wrapper);
const patchedQuery = patchQuery(query);
const [savedOrchestrator, savedWrapper, savedQuery] = await Promise.all([
  api(`/workflows/${ORCHESTRATOR_ID}`, { method: 'PUT', body: minimalWorkflow(patchedOrchestrator) }),
  api(`/workflows/${WRAPPER_ID}`, { method: 'PUT', body: minimalWorkflow(patchedWrapper) }),
  api(`/workflows/${QUERY_ID}`, { method: 'PUT', body: minimalWorkflow(patchedQuery) }),
]);
for (const id of [ORCHESTRATOR_ID, WRAPPER_ID, QUERY_ID]) {
  try { await api(`/workflows/${id}/activate`, { method: 'POST', body: {} }); } catch {}
}

console.log(JSON.stringify({
  apply: true,
  backupDir,
  publisher: { id: publisher.id, name: publisher.name, active: publisher.active, nodeCount: publisher.nodes.length },
  orchestrator: { id: savedOrchestrator.id, nodeCount: savedOrchestrator.nodes.length },
  wrapper: { id: savedWrapper.id, nodeCount: savedWrapper.nodes.length },
  query: { id: savedQuery.id, nodeCount: savedQuery.nodes.length },
}, null, 2));
