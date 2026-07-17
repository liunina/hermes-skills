const base = $('Prepare final AI request').first().json || {};
const ai = $input.first().json || {};
const fence = String.fromCharCode(96).repeat(3);
const clean = (value) => String(value ?? '').trim();

function collect(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collect).join('');
  if (typeof value === 'object') {
    return ['output_text', 'text', 'output', 'content', 'message', 'choices']
      .map((key) => collect(value[key]))
      .join('');
  }
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
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  return null;
}

function validate(parsed) {
  const errors = [];
  const requiredObjects = ['positioning', 'priceAnalysis', 'titleAnalysis', 'imageAplus', 'reviewMining', 'keywords', 'listingSuggestionsForOwnProduct'];
  const requiredArrays = ['sellingPoints', 'opportunityPoints', 'riskPoints', 'evidenceLimits'];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ['root must be a JSON object'];
  if (parsed.schemaVersion !== 'amazon-item-evidence-v4') errors.push('schemaVersion must equal amazon-item-evidence-v4');
  if (!['own', 'competitor'].includes(parsed.itemRole)) errors.push('itemRole must be own or competitor');
  if (parsed.itemRole && parsed.itemRole !== (base.itemRole || 'competitor')) errors.push('itemRole does not match request itemRole');
  for (const key of requiredObjects) if (!parsed[key] || typeof parsed[key] !== 'object' || Array.isArray(parsed[key])) errors.push(`${key} must be an object`);
  for (const key of requiredArrays) if (!Array.isArray(parsed[key])) errors.push(`${key} must be an array`);

  const keywordGroups = ['core', 'feature', 'scenario', 'longTail', 'backendSearchTerms', 'evidence'];
  if (parsed.keywords && typeof parsed.keywords === 'object') {
    for (const key of keywordGroups) if (!Array.isArray(parsed.keywords[key])) errors.push(`keywords.${key} must be an array`);
  }
  const review = parsed.reviewMining || {};
  if (!['success', 'partial', 'unavailable', 'failed'].includes(review.status)) errors.push('reviewMining.status is invalid');
  for (const key of ['positiveThemes', 'negativeThemes', 'purchaseBarriers', 'usageProblems', 'expectationGaps', 'frequentQuestions', 'listingFixes', 'productFixes', 'evidenceNotes']) {
    if (!Array.isArray(review[key])) errors.push(`reviewMining.${key} must be an array`);
  }
  const sampleSize = Number(base.listing?.reviewEvidence?.sampleSize || 0);
  if (sampleSize === 0 && review.status === 'success') errors.push('reviewMining.status cannot be success when Review sampleSize is 0');
  if (sampleSize === 0 && ((review.positiveThemes || []).length || (review.negativeThemes || []).length)) errors.push('Review theme arrays must be empty when Review sampleSize is 0');

  for (const [groupName, values] of [['opportunityPoints', parsed.opportunityPoints], ['riskPoints', parsed.riskPoints]]) {
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${groupName}[${index}] must be an object`);
      else {
        if (!clean(value.id)) errors.push(`${groupName}[${index}].id is required`);
        if (!clean(value.insight)) errors.push(`${groupName}[${index}].insight is required`);
        if (!Array.isArray(value.evidenceRefs)) errors.push(`${groupName}[${index}].evidenceRefs must be an array`);
        if (!['P0', 'P1', 'P2', '待确认'].includes(value.priority)) errors.push(`${groupName}[${index}].priority is invalid`);
      }
    });
  }
  return errors.slice(0, 24);
}

const aiText = collect(ai);
const parsed = parseJson(aiText);
const validationErrors = validate(parsed);
const aiFailed = Boolean(ai.error);
return [{
  json: {
    ...base,
    aiParsed: parsed,
    aiRawText: aiText.slice(0, 18000),
    aiFailed,
    aiError: ai.error || null,
    shouldRetryInvalidJson: !aiFailed && validationErrors.length > 0,
    analysisValidation: {
      passed: !aiFailed && validationErrors.length === 0,
      errors: validationErrors,
      schemaVersion: 'amazon-item-evidence-v4',
    },
    resultSource: 'openai_first',
  },
}];

