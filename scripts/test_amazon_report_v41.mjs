#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const fixturePath = path.resolve(process.argv[2] || 'tmp/n8n-previews/amazon-competitor-report-v2-acr_20260716044836_u82yrl/report-data.json');
const referenceDir = path.resolve('skills/amazon-competitor-analysis/references/workflow-code');
const [fixtureText, rendererCode, formatterCode] = await Promise.all([
  readFile(fixturePath, 'utf8'),
  readFile(path.join(referenceDir, 'generate-professional-report-v4.js'), 'utf8'),
  readFile(path.join(referenceDir, 'format-final-report-v4.js'), 'utf8'),
]);
const fixture = JSON.parse(fixtureText);
const reportInput = fixture.reportInput || fixture;
const finalized = {
  reportInput,
  runId: reportInput.runId,
  status: reportInput.status,
  publishWiki: false,
  dryRun: true,
  finalWikiPath: reportInput.finalWikiPath,
  runRow: {},
};

function runCode(code, nodes, input = {}) {
  const context = {
    $: (name) => nodes[name],
    $input: { first: () => ({ json: input }) },
  };
  return vm.runInNewContext(`(function(){${code}\n})()`, context);
}

const rendered = runCode(rendererCode, {
  'Finalize run-level synthesis': { first: () => ({ json: finalized }) },
})[0].json;
assert.match(rendered.text, /## 8\. 图片 \/ A\+ \/ 视频转化漏斗/);
assert.match(rendered.text, /## 12\. P0 \/ P1 \/ P2 执行清单/);
assert.match(rendered.text, /视觉证据：输入/);
assert.doesNotMatch(rendered.text, /刀头|充电续航|前\s*80\s*字符/);
for (const action of reportInput.marketSynthesis?.ownDecision?.actionPlan || []) assert.match(rendered.text, new RegExp(action.id));

const formatted = runCode(formatterCode, {
  'Finalize run-level synthesis': { first: () => ({ json: finalized }) },
}, rendered)[0].json;
assert.equal(formatted.reportQa.passed, true, JSON.stringify(formatted.reportQa));
assert.match(formatted.title, new RegExp(`^${reportInput.ownAsin} - Amazon`));
assert.match(formatted.wikiArchivePath, new RegExp(`/runs/${reportInput.runId}$`));
assert.equal(formatted.reportConsistency.actionCount, reportInput.marketSynthesis?.ownDecision?.actionPlan?.length || 0);

const poisoned = runCode(formatterCode, {
  'Finalize run-level synthesis': { first: () => ({ json: finalized }) },
}, { ...rendered, text: `${rendered.text}\n\n刀头充电续航。` })[0].json;
assert.equal(poisoned.reportQa.passed, false);
assert.ok(poisoned.reportQa.blockingIssues.some((issue) => issue.code === 'CATEGORY_TEMPLATE_LEAK'));

console.log(JSON.stringify({
  ok: true,
  fixture: fixturePath,
  reportVersion: rendered.reportVersion,
  reportLength: rendered.text.length,
  reportQa: formatted.reportQa,
  reportConsistency: formatted.reportConsistency,
  poisonGate: poisoned.reportQa.blockingIssues,
}, null, 2));
