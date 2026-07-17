#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const referenceDir = path.resolve('skills/amazon-listing-audit/references');
const [normalizeCode, validateCode, renderCode, verifyPublicationCode] = await Promise.all([
  readFile(path.join(referenceDir, 'workflow-code/normalize-input.js'), 'utf8'),
  readFile(path.join(referenceDir, 'workflow-code/validate-audit-json.js'), 'utf8'),
  readFile(path.join(referenceDir, 'html-report/generate-artifacts.js'), 'utf8'),
  readFile(path.join(referenceDir, 'html-report/verify-publication.js'), 'utf8'),
]);

function runCode(code, { input = {}, nodes = {} } = {}) {
  const context = {
    Buffer,
    $input: { first: () => ({ json: input }), all: () => [{ json: input }] },
    $: (name) => {
      if (!nodes[name]) throw new Error(`Node data unavailable: ${name}`);
      return nodes[name];
    },
  };
  return vm.runInNewContext(`(function(){${code}\n})()`, context);
}

const jp = runCode(normalizeCode, { input: { productUrl: 'https://www.amazon.co.jp/gp/product/b0dphnqkt5?ref_=x', reportLanguage: 'zh-CN' } })[0].json;
assert.equal(jp.valid, true);
assert.equal(jp.asin, 'B0DPHNQKT5');
assert.equal(jp.marketplace, 'amazon.co.jp');
assert.equal(jp.listingLocale, 'ja-JP');
assert.equal(jp.productUrl, 'https://www.amazon.co.jp/dp/B0DPHNQKT5');
assert.equal(jp.runRow.status, 'queued');

const unsupported = runCode(normalizeCode, { input: { productUrl: 'https://www.amazon.evil/dp/B0DPHNQKT5' } })[0].json;
assert.equal(unsupported.valid, false);
assert.ok(unsupported.validationErrors.some((error) => error.includes('允许列表')));

const mismatch = runCode(normalizeCode, { input: { productUrl: 'https://www.amazon.com/dp/B0DPHNQKT5', marketplace: 'amazon.co.jp' } })[0].json;
assert.equal(mismatch.valid, false);
assert.ok(mismatch.validationErrors.some((error) => error.includes('不一致')));

const audit = {
  schemaVersion: 'amazon-listing-audit-v2',
  executiveSummary: { positioning: 'Daily backpack', primaryConversionBarrier: 'Proof is weak', topPriorities: ['Title', 'Images', 'A+'] },
  listingDiagnosis: {
    title: { strengths: [], issues: ['Too long'], recommendedTitle: '軽量デイパック', rationale: 'Clearer intent' },
    bulletPoints: { issues: [], recommendedBullets: ['軽量素材'] },
    description: { issues: [], recommendedStructure: ['Use case'] },
    searchTerms: { keywordThemes: ['daypack'], exclusions: [] },
  },
  visualDiagnosis: { status: 'partial', clickAttraction: 'Average', benefitClarity: 'Weak', proofStrength: 'Weak', doubtReduction: 'Partial', imagePlan: [{ slot: 1, role: 'Main', objective: 'Click', visualEvidence: 'White background', copyDirection: '' }] },
  aplusDiagnosis: { status: 'unknown', currentGaps: ['Source did not return A+'], recommendedModules: [] },
  complianceRisks: [],
  conversionOpportunities: [{ priority: 'P1', lever: 'Proof', evidence: 'No close-up', action: 'Add material detail', impact: 'Reduce doubt' }],
  actionPlan: [
    { priority: 'P0', task: 'Fix title', reason: 'Clarity', deliverable: 'Title' },
    { priority: 'P1', task: 'Add detail image', reason: 'Proof', deliverable: 'Image' },
    { priority: 'P2', task: 'Improve A+', reason: 'Depth', deliverable: 'A+ module' },
  ],
  evidenceLimits: ['Only one image was available'],
  confidence: 0.72,
};
const aiOutput = { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(audit) }] }] };
const validated = runCode(validateCode, {
  input: aiOutput,
  nodes: { 'Prepare audit request': { first: () => ({ json: { analysisInput: { asin: jp.asin } } }) } },
})[0].json;
assert.equal(validated.auditValidation.valid, true, JSON.stringify(validated.auditValidation));

const artifacts = runCode(renderCode, {
  nodes: {
    'When called to publish listing audit': {
      first: () => ({ json: {
        runId: 'listing_test_001', asin: jp.asin, marketplace: jp.marketplace, reportLanguage: 'zh-CN', status: 'partial',
        deliveryBaseUrl: 'https://workflow.example/webhook/amazon-listing-audit-report',
        shortBaseUrl: 'https://data.example', useShortUrl: true,
        listing: { asin: jp.asin, marketplace: jp.marketplace, title: '轻量背包 <script>alert(1)</script>', brand: 'Example', price: '¥4,980', rating: 4.3, reviewCount: 125, images: ['https://example.com/main.jpg'] },
        visualAnalysis: { status: 'partial' }, audit,
      } }),
    },
  },
});
assert.equal(artifacts.length, 4);
const html = Buffer.from(artifacts[0].binary.data.data, 'base64').toString('utf8');
assert.match(html, /<!doctype html>/i);
assert.match(artifacts[0].json.s3Key, /amazon\/listing-audits/i);
assert.equal(artifacts[0].json.publicUrl, 'https://data.example/amazon/listing-audits/B0DPHNQKT5/');
assert.match(artifacts[0].json.gatewayUrl, /^https:\/\/workflow\.example\/webhook\/amazon-listing-audit-report\?key=/);
assert.match(artifacts[0].json.gatewayUrl, /amazon%2Flisting-audits%2FB0DPHNQKT5%2Findex\.html/);
assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/i);
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/i);
assert.doesNotMatch(html, /清洁原理|4段模式|コードレス充電|刀头|充电续航/);
assert.match(html, /軽量デイパック/);

const publication = {
  ok: true,
  publishStatus: 'success',
  publishError: '',
  useShortUrl: true,
  htmlReportUrl: 'https://data.example/amazon/listing-audits/B0DPHNQKT5/',
  htmlArchiveUrl: 'https://data.example/amazon/listing-audits/B0DPHNQKT5/runs/listing_test_001/',
  gatewayHtmlReportUrl: 'https://workflow.example/webhook/amazon-listing-audit-report?key=latest',
  gatewayHtmlArchiveUrl: 'https://workflow.example/webhook/amazon-listing-audit-report?key=archive',
};
const delivered = runCode(verifyPublicationCode, {
  input: { statusCode: 200, body: html },
  nodes: {
    'Return listing audit artifact links': { first: () => ({ json: publication }) },
    'Verify private listing audit gateway': { first: () => ({ json: { statusCode: 200, body: html } }) },
  },
})[0].json;
assert.equal(delivered.publishStatus, 'success');
assert.equal(delivered.deliveryStatus, 'success');
assert.equal(delivered.deliveryMode, 'short_url');
assert.equal(delivered.htmlReportUrl, publication.htmlReportUrl);

const deliveredFromData = runCode(verifyPublicationCode, {
  input: { statusCode: 200, data: html },
  nodes: {
    'Return listing audit artifact links': { first: () => ({ json: publication }) },
    'Verify private listing audit gateway': { first: () => ({ json: { statusCode: 200, data: html } }) },
  },
})[0].json;
assert.equal(deliveredFromData.publishStatus, 'success');
assert.equal(deliveredFromData.deliveryStatus, 'success');
assert.equal(deliveredFromData.htmlReportUrl, publication.htmlReportUrl);

const gatewayFallback = runCode(verifyPublicationCode, {
  input: { statusCode: 502, data: 'Bad Gateway' },
  nodes: {
    'Return listing audit artifact links': { first: () => ({ json: publication }) },
    'Verify private listing audit gateway': { first: () => ({ json: { statusCode: 200, data: html } }) },
  },
})[0].json;
assert.equal(gatewayFallback.publishStatus, 'partial');
assert.equal(gatewayFallback.deliveryStatus, 'fallback');
assert.equal(gatewayFallback.deliveryMode, 'gateway_fallback');
assert.equal(gatewayFallback.htmlReportUrl, publication.gatewayHtmlReportUrl);
assert.match(gatewayFallback.publishError, /short_report_unavailable: HTTP 502/);

const inaccessible = runCode(verifyPublicationCode, {
  input: { statusCode: 403, body: '<Error><Code>AccessDenied</Code></Error>' },
  nodes: {
    'Return listing audit artifact links': { first: () => ({ json: publication }) },
    'Verify private listing audit gateway': { first: () => ({ json: { statusCode: 403, body: '<Error><Code>AccessDenied</Code></Error>' } }) },
  },
})[0].json;
assert.equal(inaccessible.publishStatus, 'failed');
assert.equal(inaccessible.deliveryStatus, 'failed');
assert.equal(inaccessible.htmlReportUrl, '');
assert.match(inaccessible.publishError, /HTTP 403/);

console.log(JSON.stringify({
  ok: true,
  normalization: { asin: jp.asin, marketplace: jp.marketplace, listingLocale: jp.listingLocale },
  validationErrors: validated.auditValidation.errors,
  artifactTypes: artifacts.map((item) => item.json.artifactType),
  htmlBytes: Buffer.byteLength(html),
  publicationVerification: {
    bodySuccess: delivered.deliveryHttpStatus,
    dataSuccess: deliveredFromData.deliveryHttpStatus,
    gatewayFallback: gatewayFallback.gatewayDeliveryHttpStatus,
    denied: inaccessible.deliveryHttpStatus,
  },
}, null, 2));
