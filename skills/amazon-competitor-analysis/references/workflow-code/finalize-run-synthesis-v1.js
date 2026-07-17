const base = $('Prepare run-level synthesis input').first().json || {};
const current = $input.first().json || {};
const reportInput = base.reportInput || {};
const clean = (value) => String(value ?? '').trim();
const arr = (value) => Array.isArray(value) ? value : [];
const fence = String.fromCharCode(96).repeat(3);

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

const directParsed = current.synthesisParsed && typeof current.synthesisParsed === 'object' ? current.synthesisParsed : null;
const retryParsed = directParsed || parseJson(collect(current));
const parsed = retryParsed?.schemaVersion === 'amazon-run-synthesis-v1' ? retryParsed : null;

function normalizeModel(raw) {
  const dimensions = arr(raw?.dimensions).slice(0, 6).map((value, index) => ({
    key: clean(value?.key) || `dimension_${index + 1}`,
    label: clean(value?.label || value?.key) || `维度 ${index + 1}`,
    weight: Math.max(0, Number(value?.weight || 0)),
    reason: clean(value?.reason).slice(0, 180),
    scoreAnchor: clean(value?.scoreAnchor).slice(0, 180),
  })).filter((value) => value.weight > 0);
  if (dimensions.length < 4) return null;
  const sum = dimensions.reduce((total, value) => total + value.weight, 0) || 1;
  const normalized = dimensions.map((value) => ({ ...value, weight: Math.round((value.weight / sum) * 1000) / 10 }));
  const rounded = normalized.reduce((total, value) => total + value.weight, 0);
  normalized[normalized.length - 1].weight = Math.round((normalized[normalized.length - 1].weight + 100 - rounded) * 10) / 10;
  return {
    category: clean(raw?.category || reportInput.productIdea) || 'Amazon 商品',
    dimensions: normalized,
    weightTotal: 100,
    modelVersion: clean(raw?.modelVersion) || 'run-rubric-v1',
    source: 'ai_run_level',
  };
}

const model = normalizeModel(parsed?.categoryScoringModel);
const rawScorecards = new Map(arr(parsed?.scorecards).map((value) => [clean(value?.asin), value]));
function normalizeScorecard(asin) {
  if (!model) return { totalScore: null, confidence: 0, coverage: 0, rankingReliability: 'insufficient', dimensions: [] };
  const raw = rawScorecards.get(clean(asin)) || {};
  const sourceByKey = new Map(arr(raw.dimensions).map((value) => [clean(value?.key), value]));
  const dimensions = model.dimensions.map((definition) => {
    const value = sourceByKey.get(definition.key);
    const numeric = value?.score === null || value?.score === undefined || value?.score === '' ? null : Number(value.score);
    const score = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
    return {
      key: definition.key,
      score,
      confidence: score === null ? 0 : Math.max(0, Math.min(1, Number(value?.confidence || 0))),
      evidenceRefs: arr(value?.evidenceRefs).slice(0, 8),
      evidence: arr(value?.evidenceRefs).slice(0, 4).join('；'),
      evidenceStatus: score === null ? 'missing' : (clean(value?.evidenceStatus) || 'observed'),
    };
  });
  const observedWeight = dimensions.reduce((total, value, index) => total + (value.score === null ? 0 : model.dimensions[index].weight), 0);
  const weighted = dimensions.reduce((total, value, index) => total + (value.score === null ? 0 : value.score * model.dimensions[index].weight), 0);
  const coverage = Math.round((observedWeight / 100) * 100) / 100;
  const observed = dimensions.filter((value) => value.score !== null);
  const confidence = observed.length ? Math.round((observed.reduce((total, value) => total + value.confidence, 0) / observed.length) * 100) / 100 : 0;
  const totalScore = coverage < 0.6 ? null : Math.round((weighted / (observedWeight || 1)) * 10) / 10;
  return {
    totalScore,
    confidence,
    coverage,
    rankingReliability: totalScore === null ? 'insufficient' : (coverage >= 0.8 && confidence >= 0.75 ? 'high' : (coverage >= 0.6 && confidence >= 0.5 ? 'medium' : 'low')),
    dimensions,
  };
}

function updateEntity(entity) {
  if (!entity) return entity;
  const scorecard = normalizeScorecard(entity.asin);
  const stored = entity.analysis && typeof entity.analysis === 'object' ? entity.analysis : {};
  const nested = stored.analysis && typeof stored.analysis === 'object' ? stored.analysis : {};
  return {
    ...entity,
    categoryScoringModel: model,
    scorecard,
    analysis: {
      ...stored,
      categoryScoringModel: model,
      scorecard,
      analysis: { ...nested, categoryScoringModel: model, scorecard },
    },
  };
}

const marketSynthesis = parsed ? {
  ...parsed,
  status: model ? 'success' : 'partial',
  model: base.synthesisModel || 'gpt-5.5',
  promptVersion: base.synthesisPromptVersion || 'amazon-run-synthesis-v1',
  generatedAt: new Date().toISOString(),
} : {
  schemaVersion: 'amazon-run-synthesis-v1',
  status: base.shouldRunSynthesis ? 'failed_fallback' : 'skipped_insufficient_entities',
  model: base.synthesisModel || 'gpt-5.5',
  promptVersion: base.synthesisPromptVersion || 'amazon-run-synthesis-v1',
  marketConclusion: { headline: '', summary: '', segments: [], competitiveSignals: [], dataQualityNotes: ['批次级 AI 综合分析未形成有效结果，报告使用确定性降级逻辑。'] },
  categoryScoringModel: null,
  scorecards: [],
  ownDecision: { position: '', opportunities: [], risks: [], actionPlan: [] },
  titleStrategy: { competitorPatterns: [], ownGaps: [], recommendedFormula: '', recommendedDirection: '', mustVerify: [] },
  keywordStrategy: { core: [], feature: [], scenario: [], longTail: [], backendCandidates: [], negativeOrRestricted: [], mustVerify: [] },
  imageAplusStrategy: { competitorPatterns: [], recommendedSequence: [], ownPriorities: [], borrowablePatterns: [], complianceNotes: [] },
  reviewStrategy: { sharedPositiveThemes: [], sharedPainPoints: [], purchaseBarriers: [], faqPriorities: [], productValidationNeeds: [] },
  evidenceLimits: ['Run-level synthesis unavailable.'],
  generatedAt: new Date().toISOString(),
};

const updatedReportInput = {
  ...reportInput,
  ownBaseline: updateEntity(reportInput.ownBaseline),
  items: arr(reportInput.items).map(updateEntity),
  categoryScoringModel: model,
  marketSynthesis,
  dataQuality: {
    ...(reportInput.dataQuality || {}),
    synthesisStatus: marketSynthesis.status,
    scorecardCoverage: [reportInput.ownBaseline, ...arr(reportInput.items)].filter(Boolean).map((entity) => {
      const scorecard = normalizeScorecard(entity.asin);
      return { asin: entity.asin, coverage: scorecard.coverage, rankingReliability: scorecard.rankingReliability };
    }),
  },
};

return [{ json: { ...base, reportInput: updatedReportInput, marketSynthesis, synthesisValidation: current.synthesisValidation || { passed: Boolean(parsed), errors: parsed ? [] : ['No valid run-level synthesis JSON'] } } }];

