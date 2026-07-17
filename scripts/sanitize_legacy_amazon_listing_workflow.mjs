#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const BASE_URL = (process.env.N8N_BASE_URL || 'https://workflow.dinve.com').replace(/\/+$/, '');
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = process.env.LEGACY_AMAZON_LISTING_WORKFLOW_ID || '6gwIlusLe2WDyVGR';

if (!API_KEY) throw new Error('N8N_API_KEY is required.');

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

const workflow = await api(`/workflows/${WORKFLOW_ID}`);
if (workflow.isArchived) {
  console.log(JSON.stringify({
    ok: true,
    apply: false,
    workflowId: workflow.id,
    active: workflow.active,
    isArchived: true,
    message: 'Legacy workflow is already sanitized and archived.',
  }, null, 2));
  process.exit(0);
}
if (workflow.active) throw new Error('Refusing to sanitize an active legacy workflow. Deactivate it first.');

const nodeByName = (name) => {
  const found = workflow.nodes.find((node) => node.name === name);
  if (!found) throw new Error(`Node not found: ${name}`);
  return found;
};

const collectAiTextCode = `const aiOutput = $input.first().json || {};
function collectText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value !== 'object') return '';
  if (typeof value.output_text === 'string') return value.output_text;
  if (typeof value.text === 'string') return value.text;
  return collectText(value.output) + collectText(value.content) + collectText(value.message);
}
let source = {};
try { source = $('去重图片').first().json || {}; }
catch { try { source = $('跳过图片分析').first().json || {}; } catch {} }
const reportMarkdown = collectText(aiOutput).trim();
return [{ json: {
  ok: Boolean(reportMarkdown),
  legacy: true,
  publishDisabled: true,
  notificationDisabled: true,
  message: '旧版工作流的外部发布已禁用，请使用 Amazon Listing Audit v2。',
  asin: source.asin || source.rawData?.asin || '',
  productName: source.rawData?.title || '',
  productUrl: source.rawData?.url || '',
  visualStatus: String(source.imageAnalysis || '').includes('失败') ? 'failed' : (source.imageAnalysis ? 'success' : 'not_run'),
  reportMarkdown,
} }];`;

const legacyReturnCode = `const result = $input.first().json || {};
return [{ json: {
  ...result,
  posted: false,
  notificationSkipped: true,
  replacementWorkflow: 'Amazon Listing Audit v2',
} }];`;

const saveNode = nodeByName('保存到Wiki');
saveNode.parameters = { jsCode: collectAiTextCode, mode: 'runOnceForAllItems' };
delete saveNode.continueOnFail;
delete saveNode.onError;
delete saveNode.retryOnFail;
delete saveNode.maxTries;
delete saveNode.waitBetweenTries;

const notifyNode = nodeByName('推送到Mattermost');
notifyNode.parameters = { jsCode: legacyReturnCode, mode: 'runOnceForAllItems' };
delete notifyNode.continueOnFail;
delete notifyNode.onError;
delete notifyNode.retryOnFail;
delete notifyNode.maxTries;
delete notifyNode.waitBetweenTries;

const legacyNotice = 'LEGACY: 外部发布和通知已于 2026-07-16 禁用；请迁移到 Amazon Listing Audit v2。';
if (!String(workflow.description || '').includes(legacyNotice)) {
  workflow.description = `${workflow.description || ''}\n\n${legacyNotice}`.trim();
}
const allowedSettingKeys = [
  'saveExecutionProgress',
  'saveManualExecutions',
  'saveDataErrorExecution',
  'saveDataSuccessExecution',
  'executionTimeout',
  'errorWorkflow',
  'timezone',
  'executionOrder',
  'callerPolicy',
  'callerIds',
  'timeSavedPerExecution',
  'redactionPolicy',
  'customTelemetryTags',
];
workflow.settings = Object.fromEntries(
  Object.entries(workflow.settings || {}).filter(([key]) => allowedSettingKeys.includes(key)),
);
workflow.settings.availableInMCP = false;

const payload = {
  name: workflow.name,
  description: workflow.description,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings,
};

const serialized = JSON.stringify(payload);
const forbidden = [
  /const\s+mmToken\s*=\s*['"][^'"]+['"]/i,
  /const\s+AUTH\s*=\s*['"][^'"]+['"]/i,
  /Authorization['"]?\s*:\s*['"]Bearer\s+[A-Za-z0-9._-]+/i,
];
for (const pattern of forbidden) if (pattern.test(serialized)) throw new Error(`Secret-like legacy pattern remains: ${pattern}`);

const redactedBaseline = structuredClone(workflow);
for (const node of redactedBaseline.nodes) {
  if (!['保存到Wiki', '推送到Mattermost'].includes(node.name)) continue;
  node.parameters = { jsCode: '// Redacted from baseline because the legacy node contained plaintext credentials.' };
}
delete redactedBaseline.shared;
delete redactedBaseline.activeVersion;
delete redactedBaseline.pinData;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('tmp/n8n-backups', `${stamp}-amazon-listing-legacy-security`);
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, `${WORKFLOW_ID}__legacy-redacted-baseline.json`), JSON.stringify(redactedBaseline, null, 2));
await writeFile(path.join(outputDir, `${WORKFLOW_ID}__legacy-sanitized-preview.json`), JSON.stringify(payload, null, 2));

if (!APPLY) {
  console.log(JSON.stringify({ ok: true, apply: false, outputDir, workflowId: WORKFLOW_ID }, null, 2));
  process.exit(0);
}

await api(`/workflows/${WORKFLOW_ID}`, { method: 'PUT', body: payload });
const verified = await api(`/workflows/${WORKFLOW_ID}`);
const verifiedText = JSON.stringify(verified);
for (const pattern of forbidden) if (pattern.test(verifiedText)) throw new Error(`Post-update verification failed: ${pattern}`);
if (verified.active) throw new Error('Legacy workflow unexpectedly became active.');
if (verified.settings?.availableInMCP === true) throw new Error('Legacy workflow is still exposed through MCP.');

console.log(JSON.stringify({
  ok: true,
  apply: true,
  outputDir,
  workflowId: verified.id,
  active: verified.active,
  availableInMCP: verified.settings?.availableInMCP === true,
  updatedAt: verified.updatedAt,
}, null, 2));
