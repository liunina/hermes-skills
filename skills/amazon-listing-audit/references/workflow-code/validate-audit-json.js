const aiOutput = $input.first().json || {};
let base = {};
try { base = $('Validate audit JSON').first().json || {}; } catch {}
if (!base.analysisInput) {
  try { base = $('Prepare audit request').first().json || {}; } catch {}
}
const collectText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value !== 'object') return '';
  if (typeof value.output_text === 'string') return value.output_text;
  if (typeof value.text === 'string') return value.text;
  return collectText(value.output) + collectText(value.content) + collectText(value.message) + collectText(value.choices);
};
const rawText = collectText(aiOutput).trim();
const parseJson = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
};
const audit = parseJson(rawText);
const errors = [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
if (!object(audit)) errors.push('output is not a JSON object');
if (audit?.schemaVersion !== 'amazon-listing-audit-v2') errors.push('schemaVersion must equal amazon-listing-audit-v2');
for (const key of ['executiveSummary', 'listingDiagnosis', 'visualDiagnosis', 'aplusDiagnosis']) {
  if (!object(audit?.[key])) errors.push(`missing object: ${key}`);
}
for (const key of ['complianceRisks', 'conversionOpportunities', 'actionPlan', 'evidenceLimits']) {
  if (!Array.isArray(audit?.[key])) errors.push(`missing array: ${key}`);
}
if (!Array.isArray(audit?.executiveSummary?.topPriorities) || audit.executiveSummary.topPriorities.length < 3) errors.push('topPriorities requires at least 3 items');
const priorities = new Set((audit?.actionPlan || []).map((item) => item?.priority));
for (const priority of ['P0', 'P1', 'P2']) if (!priorities.has(priority)) errors.push(`actionPlan missing ${priority}`);
if (!['success', 'partial', 'failed', 'not_available'].includes(audit?.visualDiagnosis?.status)) errors.push('invalid visualDiagnosis.status');
const confidence = Number(audit?.confidence);
if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push('confidence must be between 0 and 1');
const valid = errors.length === 0;
return [{ json: {
  ...base,
  audit,
  auditRawText: rawText,
  auditValidation: { valid, errors, schemaVersion: 'amazon-listing-audit-v2' },
  shouldRetryAudit: !valid && base.retryAttempted !== true,
} }];
