const root = $input.first().json || {};
const reportInput = root.reportInput || {};
const arr = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const one = (value, max = 220) => {
  const text = clean(typeof value === 'object' ? JSON.stringify(value) : value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const compactTheme = (value) => typeof value === 'object' ? {
  theme: one(value.theme || value.insight || value.point || value.text || value.summary, 120),
  evidenceRefs: arr(value.evidenceRefs).slice(0, 6),
  observedCount: Number(value.observedCount || value.evidenceCount || value.count || 0),
  confidence: Number(value.confidence || 0),
} : { theme: one(value, 120), evidenceRefs: [], observedCount: 0, confidence: 0 };
const compactInsight = (value) => typeof value === 'object' ? {
  id: clean(value.id),
  insight: one(value.insight || value.point || value.text || value.summary, 160),
  evidenceRefs: arr(value.evidenceRefs).slice(0, 8),
  confidence: Number(value.confidence || 0),
  businessImpact: clean(value.businessImpact),
  effort: clean(value.effort),
  priority: clean(value.priority),
  applicability: one(value.applicability || value.action, 160),
} : { id: '', insight: one(value, 160), evidenceRefs: [], confidence: 0, businessImpact: '', effort: '', priority: '待确认', applicability: '' };
const compactSellingPoint = (value) => typeof value === 'object' ? {
  point: one(value.point || value.insight || value.text, 110),
  evidenceRefs: arr(value.evidenceRefs).slice(0, 4),
  strength: clean(value.strength),
  confidence: Number(value.confidence || 0),
} : { point: one(value, 110), evidenceRefs: [], strength: '', confidence: 0 };
const compactBorrowablePattern = (value) => typeof value === 'object' ? {
  pattern: one(value.pattern || value.insight || value.text, 110),
  evidenceRefs: arr(value.evidenceRefs).slice(0, 4),
  transferability: clean(value.transferability),
  adaptationForOwn: one(value.adaptationForOwn || value.applicability, 120),
  doNotCopy: one(value.doNotCopy, 100),
} : { pattern: one(value, 110), evidenceRefs: [], transferability: '', adaptationForOwn: '', doNotCopy: '' };
const compactKeywords = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    core: arr(source.core).slice(0, 8),
    feature: arr(source.feature).slice(0, 8),
    scenario: arr(source.scenario).slice(0, 6),
    longTail: arr(source.longTail).slice(0, 6),
    backendSearchTerms: arr(source.backendSearchTerms).slice(0, 8),
    evidence: arr(source.evidence).slice(0, 6).map((item) => ({
      term: one(item?.term, 50),
      sourcePaths: arr(item?.sourcePaths).slice(0, 4),
      searchIntent: clean(item?.searchIntent),
      placement: clean(item?.placement),
      confidence: Number(item?.confidence || 0),
      evidenceStatus: clean(item?.evidenceStatus),
    })),
  };
};

const entities = [reportInput.ownBaseline, ...arr(reportInput.items)]
  .filter((entity) => entity && entity.status === 'success')
  .map((entity) => {
    const stored = entity.analysis && typeof entity.analysis === 'object' ? entity.analysis : {};
    const analysis = stored.analysis && typeof stored.analysis === 'object' ? stored.analysis : stored;
    const listing = stored.listing && typeof stored.listing === 'object' ? stored.listing : {};
    const review = stored.reviewMining && typeof stored.reviewMining === 'object' ? stored.reviewMining : (analysis.reviewMining || {});
    const visual = stored.visualAnalysis && typeof stored.visualAnalysis === 'object' ? stored.visualAnalysis : {};
    return {
      asin: clean(entity.asin || stored.competitorAsin || listing.asin),
      itemRole: entity.itemRole === 'own' ? 'own' : 'competitor',
      listing: {
        brand: clean(listing.brand || entity.brand),
        title: one(listing.title || entity.title, 260),
        price: clean(listing.price || entity.price),
        priceNumber: listing.priceNumber ?? null,
        rating: listing.rating ?? entity.rating ?? null,
        reviewCount: listing.reviewCount ?? entity.reviewCount ?? null,
        reviewSampleSize: Number(listing.reviewSampleSize || review.sampleSize || 0),
        qaStatus: clean(listing.qaStatus),
        qaSampleSize: Number(listing.qaSampleSize || 0),
        salesRank: clean(listing.salesRank || entity.salesRank),
        imageCount: Number(listing.imageCount || entity.imageCount || 0),
        aplusImageCount: Number(listing.aplusImageCount || entity.aplusImageCount || 0),
        aplusStatus: clean(listing.aplusStatus),
        videoStatus: clean(listing.videoStatus),
        features: arr(listing.features).slice(0, 6).map((value) => one(value, 120)),
      },
      positioning: {
        summary: one(analysis.positioning?.summary, 140),
        targetAudience: arr(analysis.positioning?.targetAudience).slice(0, 4),
        usageScenarios: arr(analysis.positioning?.usageScenarios).slice(0, 4),
        priceTier: one(analysis.positioning?.priceTier, 80),
        trustSignals: arr(analysis.positioning?.trustSignals).slice(0, 4),
      },
      priceAnalysis: {
        valueProposition: one(analysis.priceAnalysis?.valueProposition, 140),
        promotionSignals: arr(analysis.priceAnalysis?.promotionSignals).slice(0, 3),
      },
      titleAnalysis: {
        characterCount: Number(analysis.titleAnalysis?.characterCount || 0),
        strengths: arr(analysis.titleAnalysis?.strengths).slice(0, 3),
        gaps: arr(analysis.titleAnalysis?.gaps).slice(0, 3),
        observedTerms: arr(analysis.titleAnalysis?.observedTerms).slice(0, 10),
        complianceFlags: arr(analysis.titleAnalysis?.complianceFlags).slice(0, 3),
        recommendedDirection: one(analysis.titleAnalysis?.recommendedDirection, 140),
      },
      sellingPoints: arr(analysis.sellingPoints).slice(0, 5).map(compactSellingPoint),
      imageAplus: {
        sequenceAssessment: one((analysis.imageAplus || stored.imageAplus || {}).sequenceAssessment, 140),
        funnelCoverage: arr((analysis.imageAplus || stored.imageAplus || {}).funnelCoverage).slice(0, 8),
        conversionFunnelGaps: arr((analysis.imageAplus || stored.imageAplus || {}).conversionFunnelGaps).slice(0, 4),
        borrowablePatterns: arr((analysis.imageAplus || stored.imageAplus || {}).borrowablePatterns).slice(0, 4).map(compactBorrowablePattern),
      },
      visualSummary: {
        status: clean(visual.status),
        analyzedImageCount: Number(visual.analyzedImageCount || 0),
        failedImageCount: Number(visual.failedImageCount || 0),
        results: arr(visual.results).filter((value) => value?.imageReadSuccess === true).slice(0, 6).map((value, index) => ({
          ref: `visualAnalysis.results[${index}]`,
          role: clean(value.role || value.imageType),
          funnelStage: clean(value.funnelStage),
          coreMessage: one(value.coreMessage, 140),
          borrowablePatterns: arr(value.borrowablePatterns).slice(0, 2),
          ownProductImplication: one(value.ownProductImplication, 110),
          complianceRisks: arr(value.complianceRisks).slice(0, 2),
        })),
      },
      reviewMining: {
        status: clean(review.status),
        sampleSize: Number(review.sampleSize || listing.reviewSampleSize || 0),
        positiveThemes: arr(review.positiveThemes).slice(0, 4).map(compactTheme),
        negativeThemes: arr(review.negativeThemes).slice(0, 4).map(compactTheme),
        purchaseBarriers: arr(review.purchaseBarriers).slice(0, 4),
        frequentQuestions: arr(review.frequentQuestions).slice(0, 4),
      },
      opportunityPoints: arr(analysis.opportunityPoints || stored.opportunityPoints).slice(0, 4).map(compactInsight),
      riskPoints: arr(analysis.riskPoints || stored.riskPoints).slice(0, 4).map(compactInsight),
      keywords: compactKeywords(analysis.keywords || stored.keywords || {}),
      evidenceLimits: arr(stored.evidenceLimits || analysis.evidenceLimits).slice(0, 4),
    };
  });

const synthesisInput = {
  runId: clean(reportInput.runId || root.runId),
  marketplace: clean(reportInput.marketplace || root.marketplace || 'amazon.co.jp'),
  locale: clean(reportInput.locale || root.locale || 'zh-CN'),
  ownAsin: clean(reportInput.ownAsin || root.ownAsin),
  productIdea: clean(reportInput.productIdea || root.productIdea),
  targetAudience: clean(reportInput.targetAudience || root.targetAudience),
  focus: clean(reportInput.focus || root.focus),
  entities,
  failedItems: arr(reportInput.failedItems).map((item) => ({ asin: clean(item.competitorAsin), errorType: clean(item.errorType), errorMessage: one(item.errorMessage, 180) })),
};

return [{ json: { ...root, synthesisInput, shouldRunSynthesis: entities.length >= 2, synthesisModel: 'gpt-5.5', synthesisPromptVersion: 'amazon-run-synthesis-v1' } }];
