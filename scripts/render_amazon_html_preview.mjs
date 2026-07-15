#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const runId = process.env.AMAZON_PREVIEW_RUN_ID || 'acr_20260715083129_h8gsi2';
const apiUrl = process.env.AMAZON_QUERY_URL || 'https://workflow.dinve.com/webhook/amazon-competitor-analysis-run-query-v2-2fb6c8b01d6a';
const previewRoot = path.resolve(process.env.AMAZON_PREVIEW_DIR || `tmp/n8n-previews/amazon-competitor-report-v2-${runId}`);
const referenceDir = path.resolve('skills/amazon-competitor-analysis/references/html-report');

const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId }) });
if (!response.ok) throw new Error(`query failed: ${response.status}`);
const query = await response.json();
if (!query.ok || !query.run?.inputJson) throw new Error(`run ${runId} has no reusable input JSON`);

const [generator, css, js, icons] = await Promise.all([
  readFile(path.join(referenceDir, 'generate-artifacts.js'), 'utf8'),
  readFile(path.join(referenceDir, 'report-v2.css'), 'utf8'),
  readFile(path.join(referenceDir, 'assets/js/report-v2.js'), 'utf8'),
  readFile(path.join(referenceDir, 'assets/icons/report-icons.svg'), 'utf8'),
]);

const input = query.run.inputJson;
const config = {
  styleVersion: 'v2', runId, ownAsin: input.ownAsin, bucket: 'preview', prefix: 'preview',
  publicBaseUrl: '.', cssKey: 'report-v2.css', cssUrl: './report-v2.css', jsKey: 'report-v2.js', jsUrl: './report-v2.js',
  iconKey: 'report-icons.svg', iconUrl: './report-icons.svg', fontKeys: [], latestHtmlKey: 'index.html', archiveHtmlKey: 'index.html',
  manifestKey: 'manifest.json', reportDataKey: 'report-data.json', maxProductImages: 5, maxAplusImages: 4,
};
const entities = [input.ownBaseline, ...(Array.isArray(input.items) ? input.items : [])].filter(Boolean);
const prepared = [];
for (const entity of entities) {
  const listing = entity.analysis?.listing || {};
  const main = String(listing.mainImageUrl || '').trim();
  if (/^https?:\/\//i.test(main)) prepared.push({ config, asin: entity.asin, itemRole: entity.itemRole || 'competitor', assetRole: 'main', sourceUrl: main, displayUrl: main, publicUrl: main, sourceFetchStatus: 'success' });
  const productUrls = (listing.images || []).filter((url) => /^https?:\/\//i.test(String(url)) && String(url).trim() !== main).slice(0, 5);
  productUrls.forEach((sourceUrl, index) => prepared.push({ config, asin: entity.asin, itemRole: entity.itemRole || 'competitor', assetRole: 'product', assetIndex: index, sourceUrl, displayUrl: sourceUrl, publicUrl: sourceUrl, sourceFetchStatus: 'success' }));
  const aplusUrls = (listing.aplusImages || []).filter((url) => /^https?:\/\//i.test(String(url))).slice(0, 4);
  aplusUrls.forEach((sourceUrl, index) => prepared.push({ config, asin: entity.asin, itemRole: entity.itemRole || 'competitor', assetRole: 'aplus', assetIndex: index, sourceUrl, displayUrl: sourceUrl, publicUrl: sourceUrl, sourceFetchStatus: 'success' }));
}
const nodes = {
  'When called by orchestrator': { first: () => ({ json: { reportInput: input, markdown: '# 详细证据\n\n此预览使用既有枕头报告的结构化结果验证 report-v2 布局。', reportQa: input.reportQa || {}, reportVersion: input.reportVersion || 'v3.1', title: `Amazon 枕头竞品分析报告 - ${input.ownAsin}`, wikiPath: input.finalWikiPath || '' } }) },
  'Prepare image tasks': { all: () => prepared.map((json) => ({ json })) },
  'Build image binaries': { all: () => prepared.map(() => ({ json: { sourceFetchStatus: 'success' } })) },
};
const context = {
  $: (name) => nodes[name], $input: { all: () => prepared.map(() => ({ json: { success: true } })) }, Buffer,
  REPORT_CSS_V1: '', REPORT_CSS_V2: css, REPORT_JS: js, REPORT_ICONS: icons, REPORT_FONTS: [],
};
const artifacts = vm.runInNewContext(`(function(){${generator}\n})()`, context);
await mkdir(previewRoot, { recursive: true });
for (const artifact of artifacts) {
  const fileName = path.basename(artifact.json.s3Key);
  if (artifact.json.artifactType === 'html_latest') await writeFile(path.join(previewRoot, 'index.html'), Buffer.from(artifact.binary.data.data, 'base64'));
  else if (artifact.json.artifactType === 'css') await writeFile(path.join(previewRoot, 'report-v2.css'), artifact.json.content, 'utf8');
  else if (artifact.json.artifactType === 'javascript') await writeFile(path.join(previewRoot, 'report-v2.js'), artifact.json.content, 'utf8');
  else if (artifact.json.artifactType === 'icons') await writeFile(path.join(previewRoot, 'report-icons.svg'), artifact.json.content, 'utf8');
  else if (artifact.json.artifactType === 'report_data' || artifact.json.artifactType === 'manifest') await writeFile(path.join(previewRoot, fileName), artifact.json.content, 'utf8');
}
console.log(JSON.stringify({ runId, previewRoot, html: path.join(previewRoot, 'index.html'), products: entities.length }, null, 2));
