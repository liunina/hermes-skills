#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const BASE_URL = (process.env.N8N_BASE_URL || 'https://workflow.dinve.com').replace(/\/+$/, '');
const API_KEY = process.env.N8N_API_KEY;
const RUN_TABLE_ID = 'mIDM8w52YybXEwEL';
const requestedRunId = process.argv.find((value) => value.startsWith('listing_')) || '';

if (!API_KEY) throw new Error('N8N_API_KEY is required.');

const response = await fetch(`${BASE_URL}/api/v1/data-tables/${RUN_TABLE_ID}/rows?limit=100`, {
  headers: { 'X-N8N-API-KEY': API_KEY },
});
const text = await response.text();
if (!response.ok) throw new Error(`Data Table read failed (${response.status}): ${text.slice(0, 800)}`);

const payload = text ? JSON.parse(text) : {};
const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
const row = requestedRunId
  ? rows.find((item) => item.runId === requestedRunId)
  : rows.sort((a, b) => String(b.lastUpdatedAt).localeCompare(String(a.lastUpdatedAt)))[0];
if (!row) throw new Error(requestedRunId ? `Run not found: ${requestedRunId}` : 'No Listing audit runs found.');

const parse = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const source = {
  runId: row.runId,
  asin: row.asin,
  marketplace: row.marketplace,
  reportLanguage: row.reportLanguage || 'zh-CN',
  status: row.status,
  listing: parse(row.listingJson_object),
  visualAnalysis: parse(row.visualJson_object),
  audit: parse(row.auditJson_object),
  s3Bucket: 'amazon-reports',
  s3Prefix: 'amazon/listing-audits',
  publicBaseUrl: 'https://data.dinve.com/amazon-reports',
  deliveryBaseUrl: 'https://workflow.dinve.com/webhook/amazon-listing-audit-report-v2-5c0a8f2b',
  shortBaseUrl: 'https://data.dinve.com',
  useShortUrl: true,
};

const renderer = await readFile('skills/amazon-listing-audit/references/html-report/generate-artifacts.js', 'utf8');
const context = {
  Buffer,
  $: (name) => {
    if (name !== 'When called to publish listing audit') throw new Error(`Unexpected node reference: ${name}`);
    return { first: () => ({ json: source }) };
  },
};
const artifacts = vm.runInNewContext(`(function(){${renderer}\n})()`, context);
const htmlArtifact = artifacts.find((item) => item.json?.artifactType === 'html_latest');
if (!htmlArtifact?.binary?.data?.data) throw new Error('Renderer returned no HTML artifact.');

const html = Buffer.from(htmlArtifact.binary.data.data, 'base64').toString('utf8');
const outputDir = path.resolve('tmp/amazon-listing-audit-preview');
const outputPath = path.join(outputDir, `${row.runId}.html`);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, html, 'utf8');

console.log(JSON.stringify({
  ok: true,
  runId: row.runId,
  asin: row.asin,
  outputPath,
  htmlBytes: Buffer.byteLength(html),
  imageCount: source.listing.images?.length || 0,
  visualResultCount: source.visualAnalysis.results?.length || 0,
}, null, 2));
