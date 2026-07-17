const base = $('Prepare run-level synthesis input').first().json || {};
const ai = $input.first().json || {};
const fence = String.fromCharCode(96).repeat(3);
const clean = (value) => String(value ?? '').trim();
const arr = (value) => Array.isArray(value) ? value : [];

function collect(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collect).join('');
  if (typeof value === 'object') return ['output_text', 'text', 'output', 'content', 'message', 'choices'].map((key) => collect(value[key])).join('');
  return '';
}

function parseJson(text) {
  const source = clean(text);
  if (!source) return null;
  let candidate = source;
  const start = source.indexOf(fence);
  const end = start >= 0 ? source.indexOf(fence, start + fence.length) : -1;
  if (start >= 0 && end > start) candidate = source.slice(start + fence.length, end).replace(/^json\s*/i, '');
  try { return JSON.parse(candidate); } catch {}
  const match = candidate.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

function validate(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ['root must be a JSON object'];
  const objectFields = ['marketConclusion', 'categoryScoringModel', 'ownDecision', 'titleStrategy', 'keywordStrategy', 'imageAplusStrategy', 'reviewStrategy'];
  if (parsed.schemaVersion !== 'amazon-run-synthesis-v1') errors.push('schemaVersion must equal amazon-run-synthesis-v1');
  for (const key of objectFields) if (!parsed[key] || typeof parsed[key] !== 'object' || Array.isArray(parsed[key])) errors.push(`${key} must be an object`);
  if (!Array.isArray(parsed.scorecards)) errors.push('scorecards must be an array');
  if (!Array.isArray(parsed.evidenceLimits)) errors.push('evidenceLimits must be an array');
  const dimensions = arr(parsed.categoryScoringModel?.dimensions);
  if (dimensions.length < 4 || dimensions.length > 6) errors.push('categoryScoringModel.dimensions must contain 4-6 entries');
  const keys = dimensions.map((value) => clean(value?.key));
  if (keys.some((value) => !value) || new Set(keys).size !== keys.length) errors.push('categoryScoringModel dimension keys must be unique and non-empty');
  const weightTotal = dimensions.reduce((sum, value) => sum + Number(value?.weight || 0), 0);
  if (Math.abs(weightTotal - 100) > 0.5) errors.push(`categoryScoringModel weights must total 100, received ${weightTotal}`);
  const expectedAsins = arr(base.synthesisInput?.entities).map((value) => clean(value.asin)).filter(Boolean).sort();
  const actualAsins = arr(parsed.scorecards).map((value) => clean(value?.asin)).filter(Boolean).sort();
  if (expectedAsins.join('|') !== actualAsins.join('|')) errors.push('scorecards must cover every successful input ASIN exactly once');
  for (const scorecard of arr(parsed.scorecards)) {
    const scoreKeys = arr(scorecard?.dimensions).map((value) => clean(value?.key));
    if (scoreKeys.join('|') !== keys.join('|')) errors.push(`scorecard ${clean(scorecard?.asin)} dimension keys/order do not match categoryScoringModel`);
  }
  for (const key of ['opportunities', 'risks', 'actionPlan']) if (!Array.isArray(parsed.ownDecision?.[key])) errors.push(`ownDecision.${key} must be an array`);
  return errors.slice(0, 24);
}

const rawText = collect(ai);
const parsed = parseJson(rawText);
const validationErrors = validate(parsed);
const aiFailed = Boolean(ai.error);
return [{
  json: {
    ...base,
    synthesisParsed: parsed,
    synthesisRawText: rawText.slice(0, 24000),
    synthesisValidation: { passed: !aiFailed && validationErrors.length === 0, errors: validationErrors, schemaVersion: 'amazon-run-synthesis-v1' },
    synthesisAiFailed: aiFailed,
    synthesisAiError: ai.error || null,
    shouldRetrySynthesis: !aiFailed && validationErrors.length > 0,
  },
}];

