// Deterministic run-level Wiki renderer. The AI supplies structured evidence;
// this node owns wording, section completeness, and category-neutral fallbacks.
const root = $('Finalize run-level synthesis').first().json || {};
const ri = root.reportInput || {};
const synthesis = ri.marketSynthesis && typeof ri.marketSynthesis === 'object' ? ri.marketSynthesis : {};
const ownDecision = synthesis.ownDecision && typeof synthesis.ownDecision === 'object' ? synthesis.ownDecision : {};
const scoringModel = ri.categoryScoringModel || synthesis.categoryScoringModel || null;

const arr = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').replace(/\uFFFD+/g, '').replace(/\s+/g, ' ').trim();
const num = (value) => {
  const numeric = typeof value === 'number' ? value : Number(clean(value).replace(/[,，¥￥円%]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};
const one = (value, max = 180) => {
  const text = clean(typeof value === 'object' ? JSON.stringify(value) : value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const uniq = (values) => [...new Set(arr(values).map(clean).filter(Boolean))];
const flattenText = (value, output = []) => {
  if (value === null || value === undefined || value === '') return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = clean(value);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    for (const child of value) flattenText(child, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const key of ['insight', 'action', 'point', 'text', 'theme', 'summary', 'message', 'label', 'value']) {
      if (value[key]) flattenText(value[key], output);
    }
  }
  return output;
};
const uniqueText = (...values) => uniq(values.flatMap((value) => flattenText(value, [])));
const sentenceList = (values, limit = 5) => uniqueText(values).slice(0, limit).map((value) => value.replace(/[。；;，,]+$/g, '')).join('；');
const esc = (value) => clean(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const hasJapanese = (value) => /[\u3040-\u30ff]/.test(clean(value));
const quoteEvidence = (value, max = 160) => {
  const text = one(value, max);
  return hasJapanese(text) && !/^“.*”$/.test(text) ? `“${text}”` : text;
};
const yen = (value) => {
  const numeric = num(value);
  return numeric === null ? '-' : `¥${Math.round(numeric).toLocaleString('ja-JP')}`;
};
const median = (values) => {
  const numbers = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
};
const assetLabel = (value) => ({
  present: '已抓取/存在',
  absent: '明确未发现',
  partial: '部分抓取',
  unknown_fetch_failed: '抓取失败/待补抓',
  unknown_not_supported: '数据源未返回/待确认',
}[clean(value).toLowerCase()] || clean(value) || '数据源未返回/待确认');
const image = (url, width = 90) => /^https?:\/\//i.test(clean(url))
  ? `<img src="${clean(url).replace(/"/g, '&quot;')}" alt="主图" width="${width}" />`
  : '-';

const storedOf = (item) => item?.analysis && typeof item.analysis === 'object' ? item.analysis : {};
const analysisOf = (item) => {
  const stored = storedOf(item);
  return stored.analysis && typeof stored.analysis === 'object' ? stored.analysis : stored;
};
const listingOf = (item) => storedOf(item).listing && typeof storedOf(item).listing === 'object' ? storedOf(item).listing : {};
const reviewOf = (item) => storedOf(item).reviewMining && typeof storedOf(item).reviewMining === 'object'
  ? storedOf(item).reviewMining
  : (analysisOf(item).reviewMining || {});
const visualOf = (item) => storedOf(item).visualAnalysis && typeof storedOf(item).visualAnalysis === 'object' ? storedOf(item).visualAnalysis : {};
const assetsOf = (item) => listingOf(item).assetCompleteness || storedOf(item).assetCompleteness || analysisOf(item).imageAplus?.assetCompleteness || {};
const scorecardOf = (item) => analysisOf(item).scorecard || storedOf(item).scorecard || item?.scorecard || {};
const objectText = (value) => typeof value === 'object'
  ? clean(value.insight || value.action || value.point || value.text || value.theme || value.summary || '')
  : clean(value);
const objectRefs = (value) => typeof value === 'object' ? uniqueText(value.evidenceRefs, value.evidencePaths).slice(0, 8) : [];

const own = ri.ownBaseline || null;
const competitors = arr(ri.items);
const successfulCompetitors = competitors.filter((item) => item?.status === 'success');
const successfulEntities = [own, ...successfulCompetitors].filter((item) => item?.status === 'success');
const failed = uniqueText(arr(ri.failedItems).map((item) => `${item.competitorAsin || '-'}|${item.errorType || 'failed'}|${item.errorMessage || '未记录原因'}`), competitors.filter((item) => item?.status !== 'success').map((item) => `${item.asin || item.competitorAsin || '-'}|${item.errorType || 'failed'}|${item.errorMessage || '未记录原因'}`));
const ownListing = listingOf(own);
const ownAnalysis = analysisOf(own);
const prices = successfulCompetitors.map((item) => listingOf(item).priceNumber ?? listingOf(item).price ?? item.price);
const priceNumbers = prices.map(num).filter((value) => value !== null);
const priceMin = priceNumbers.length ? Math.min(...priceNumbers) : null;
const priceMax = priceNumbers.length ? Math.max(...priceNumbers) : null;
const priceMedian = median(prices);
const opportunityObjects = arr(ownDecision.opportunities);
const riskObjects = arr(ownDecision.risks);
const actionObjects = arr(ownDecision.actionPlan);
const opportunityTexts = opportunityObjects.length ? opportunityObjects.map(objectText) : uniqueText(ownAnalysis.opportunityPoints, storedOf(own).opportunityPoints);
const riskTexts = riskObjects.length ? riskObjects.map(objectText) : uniqueText(ownAnalysis.riskPoints, storedOf(own).riskPoints);
const imageStrategy = synthesis.imageAplusStrategy && typeof synthesis.imageAplusStrategy === 'object' ? synthesis.imageAplusStrategy : {};
const reviewStrategy = synthesis.reviewStrategy && typeof synthesis.reviewStrategy === 'object' ? synthesis.reviewStrategy : {};
const titleStrategy = synthesis.titleStrategy && typeof synthesis.titleStrategy === 'object' ? synthesis.titleStrategy : {};
const keywordStrategy = synthesis.keywordStrategy && typeof synthesis.keywordStrategy === 'object' ? synthesis.keywordStrategy : {};

const lines = [];
const h2 = (text) => lines.push(`## ${text}`, '');
const h3 = (text) => lines.push(`### ${text}`, '');
const paragraph = (text) => { const value = clean(text); if (value) lines.push(value, ''); };
const bullet = (text) => { const value = clean(text); if (value) lines.push(`- ${value}`); };
const table = (headers, rows) => {
  lines.push(`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.map(esc).join(' | ')} |`);
  lines.push('');
};

h2('0. 快速结论');
bullet(synthesis.marketConclusion?.headline || '本报告已完成单品证据提取、批次统一评分和我方经营决策汇总。');
if (synthesis.marketConclusion?.summary) bullet(synthesis.marketConclusion.summary);
bullet(`竞品价格带：${priceMin === null ? '数据不足' : `${yen(priceMin)}–${yen(priceMax)}，中位数约 ${yen(priceMedian)}`}。`);
if (own?.status === 'success') bullet(`我方基线：价格 ${ownListing.price || own.price || '-'}，评分 ${ownListing.rating ?? own.rating ?? '-'}，评论数 ${ownListing.reviewCount ?? own.reviewCount ?? '-'}，商品图 ${ownListing.imageCount || 0} 张，A+ ${assetLabel(ownListing.aplusStatus || assetsOf(own).aplusStatus)}，视频 ${assetLabel(ownListing.videoStatus || assetsOf(own).videoStatus)}。`);
else bullet('我方 Listing 基线未成功获取，逐字段差距和执行建议置信度下降。');
if (opportunityTexts.length) bullet(`优先机会：${sentenceList(opportunityTexts, 4)}。`);
if (riskTexts.length) bullet(`首要风险：${sentenceList(riskTexts, 3)}。`);
bullet('先执行有明确证据和验收指标的 P0 动作，再按 Review、广告和退货数据复核 P1/P2。');
lines.push('');

h2('1. 数据完整性与抓取说明');
paragraph('“明确未发现”表示数据源返回了不存在信号；“数据源未返回/待确认”表示证据未知，不能解读为页面不存在。');
table(['对象', 'ASIN', '商品图', 'A+', '视频', 'Review 样本', 'Q&A 正文', '评分覆盖'], successfulEntities.map((item) => {
  const listing = listingOf(item);
  const assets = assetsOf(item);
  const review = reviewOf(item);
  const scorecard = scorecardOf(item);
  return [item.itemRole === 'own' ? '我方' : '竞品', item.asin, assetLabel(assets.imageStatus || listing.imageStatus || (listing.imageCount ? 'present' : 'unknown_not_supported')), assetLabel(assets.aplusStatus || listing.aplusStatus), assetLabel(assets.videoStatus || listing.videoStatus), review.sampleSize || listing.reviewSampleSize || 0, listing.qaSampleSize || 0, `${Math.round(Number(scorecard.coverage || 0) * 100)}%`];
}));
const visualStats = successfulEntities.reduce((result, item) => {
  const visual = visualOf(item);
  result.total += Number(visual.totalImages || 0);
  result.analyzed += Number(visual.analyzedImageCount || 0);
  result.failed += Number(visual.failedImageCount || 0);
  result.cacheHits += Number(visual.cacheHitCount || 0);
  result.requested += Number(visual.geminiRequestedImageCount || 0);
  return result;
}, { total: 0, analyzed: 0, failed: 0, cacheHits: 0, requested: 0 });
bullet(`视觉证据：输入 ${visualStats.total} 张，成功分析 ${visualStats.analyzed} 张，失败 ${visualStats.failed} 张，缓存命中 ${visualStats.cacheHits} 张，本次 Gemini 新请求 ${visualStats.requested} 张。`);
bullet(`批次综合状态：${synthesis.status || 'unknown'}；工作流状态：${ri.status || root.status || 'unknown'}。`);
uniqueText(synthesis.marketConclusion?.dataQualityNotes, synthesis.evidenceLimits, ri.evidenceLimits).slice(0, 6).forEach((value) => bullet(`证据限制：${value}`));
lines.push('');

h2('2. 我方 Listing 基线');
if (own?.status === 'success') {
  lines.push(image(ownListing.mainImageUrl, 240), '');
  const currentTitle = clean(ownListing.title || own.title);
  table(['字段', '我方当前值', '诊断'], [
    ['ASIN', own.asin, '分析基线'],
    ['品牌', ownListing.brand || own.brand || '-', ownListing.brand ? '已识别' : '需补强品牌识别'],
    ['标题', one(currentTitle, 220), `${Array.from(currentTitle).length} 字符；按日本站 75 字符检查线复核`],
    ['价格', ownListing.price || own.price || '-', priceMedian === null ? '竞品价格不足' : ((num(ownListing.priceNumber ?? ownListing.price ?? own.price) ?? 0) > priceMedian ? '高于竞品中位数，需强化价值证据' : '不高于竞品中位数')],
    ['评分 / 评论', `${ownListing.rating ?? '-'} / ${ownListing.reviewCount ?? '-'}`, '我方社会证明基线'],
    ['商品图 / A+', `${ownListing.imageCount || 0} / ${assetLabel(assetsOf(own).aplusStatus || ownListing.aplusStatus)}`, '数量之外还需检查漏斗覆盖和移动端可读性'],
    ['视频', assetLabel(assetsOf(own).videoStatus || ownListing.videoStatus), '未知状态需补抓，明确缺失再进入素材计划'],
    ['Review / Q&A', `${reviewOf(own).sampleSize || 0} / ${ownListing.qaSampleSize || 0}`, '样本结论不等于全量评论统计'],
  ]);
} else {
  bullet('我方 Listing 抓取或分析失败，建议先补抓我方 ASIN 后再确认差距。');
  lines.push('');
}

h2('3. 竞品池概览');
table(['主图', 'ASIN', '品牌', '价格', '评分 / 评论', '商品图 / A+ / 视频', '定位摘要'], successfulCompetitors.map((item) => {
  const listing = listingOf(item);
  const assets = assetsOf(item);
  return [image(listing.mainImageUrl, 90), item.asin, listing.brand || item.brand || '-', listing.price || item.price || '-', `${listing.rating ?? item.rating ?? '-'} / ${listing.reviewCount ?? item.reviewCount ?? '-'}`, `${listing.imageCount || 0} / ${assetLabel(assets.aplusStatus || listing.aplusStatus)} / ${assetLabel(assets.videoStatus || listing.videoStatus)}`, one(analysisOf(item).positioning?.summary || item.title || '-', 150)];
}));

h2('4. AI 品类自适应竞争力评分');
if (scoringModel && arr(scoringModel.dimensions).length) {
  paragraph(`评分模型：${scoringModel.category || ri.productIdea || '当前品类'}；同一 run 的所有成功 ASIN 使用完全一致的维度与权重。覆盖率低于 60% 时总分保持为空。`);
  table(['维度', '权重', '评分依据', '分数锚点'], arr(scoringModel.dimensions).map((dimension) => [dimension.label || dimension.key, `${dimension.weight || 0}%`, one(dimension.reason || '-', 120), one(dimension.scoreAnchor || '-', 140)]));
  const dimensionKeys = arr(scoringModel.dimensions).map((dimension) => dimension.key);
  table(['ASIN', '角色', '总分', ...arr(scoringModel.dimensions).map((dimension) => dimension.label || dimension.key), '覆盖率', '置信度'], successfulEntities.map((item) => {
    const scorecard = scorecardOf(item);
    const byKey = new Map(arr(scorecard.dimensions).map((dimension) => [dimension.key, dimension]));
    return [item.asin, item.itemRole === 'own' ? '我方' : '竞品', scorecard.totalScore == null ? '待评分' : scorecard.totalScore, ...dimensionKeys.map((key) => byKey.get(key)?.score ?? '-'), `${Math.round(Number(scorecard.coverage || 0) * 100)}%`, `${Math.round(Number(scorecard.confidence || 0) * 100)}%`];
  }));
  paragraph('评分用于本批次相对比较，不代表销量预测、Amazon 星级或长期产品质量。维度证据路径保留在 Data Table 与 HTML 热力图中。');
} else paragraph('评分模型未返回，当前不进行竞争力排名，避免把缺失数据当成 0 分。');

h2('5. 价格带、规格带与定位');
paragraph(priceMin === null ? '成功竞品价格不足，暂不形成价格带结论。' : `成功竞品价格范围为 ${yen(priceMin)}–${yen(priceMax)}，中位数约 ${yen(priceMedian)}。我方价格高于中位数时必须提供可见价值证据；低于中位数时要避免页面呈现廉价感。`);
table(['ASIN', '价格', '价格层级', '价值主张', '信任信号'], successfulCompetitors.map((item) => {
  const analysis = analysisOf(item);
  const listing = listingOf(item);
  return [item.asin, listing.price || item.price || '-', analysis.priceAnalysis?.priceTier || analysis.positioning?.priceTier || '-', one(analysis.priceAnalysis?.valueProposition || analysis.positioning?.summary || '-', 130), sentenceList(analysis.positioning?.trustSignals, 4) || '-'];
}));

h2('6. 目标人群与使用场景');
h3('目标人群');
const audiences = uniqueText(successfulEntities.flatMap((item) => arr(analysisOf(item).positioning?.targetAudience)));
(audiences.length ? audiences : ['当前证据不足，目标人群待通过搜索词、广告和 Review 数据确认。']).slice(0, 10).forEach(bullet);
lines.push('');
h3('使用场景');
const scenarios = uniqueText(successfulEntities.flatMap((item) => arr(analysisOf(item).positioning?.usageScenarios)));
(scenarios.length ? scenarios : ['当前证据不足，使用场景待通过 Listing 与消费者数据确认。']).slice(0, 10).forEach(bullet);
lines.push('');

h2('7. 高转化卖点共性与差异化机会');
const sellingRows = successfulCompetitors.flatMap((item) => arr(analysisOf(item).sellingPoints).map((point) => [objectText(point), one(point?.evidence || objectRefs(point).join('；') || '-', 160), point?.strength || '-', item.asin])).filter((row) => row[0]);
if (sellingRows.length) table(['卖点', '证据', '强度', '来源 ASIN'], sellingRows.slice(0, 24));
else bullet('当前结构化证据未形成稳定卖点模式。');
h3('我方可利用的机会');
opportunityObjects.length ? table(['优先级', '机会', '行动', '证据', '来源 ASIN'], opportunityObjects.slice(0, 10).map((item) => [item.priority || '待确认', item.insight || item.text || '-', item.action || '-', objectRefs(item).join('；') || '-', arr(item.sourceAsins).join(', ') || '-'])) : opportunityTexts.slice(0, 10).forEach(bullet);

h2('8. 图片 / A+ / 视频转化漏斗');
paragraph('本节完全使用本批次品类综合策略，不使用跨品类固定模板。逐图 OCR、可见元素与借鉴建议在 HTML 证据墙中按需展开。');
const sequence = uniqueText(imageStrategy.recommendedSequence);
if (sequence.length) table(['素材位', '我方表达任务'], sequence.slice(0, 8).map((item, index) => [`${index + 1}`, item]));
else bullet('批次综合分析未返回素材顺序，需根据实际产品卖点和视觉证据补充。');
h3('竞品可借鉴模式');
uniqueText(imageStrategy.borrowablePatterns, imageStrategy.competitorPatterns).slice(0, 10).forEach(bullet);
h3('我方素材优先项');
uniqueText(imageStrategy.ownPriorities).slice(0, 10).forEach(bullet);
h3('证据与合规边界');
uniqueText(imageStrategy.complianceNotes).slice(0, 8).forEach(bullet);
bullet(`多模态逐图统计：图片总数 ${visualStats.total}，Gemini 新请求 ${visualStats.requested}，成功解析 ${visualStats.analyzed}，缓存命中 ${visualStats.cacheHits}，视觉失败 ${visualStats.failed}。`);
lines.push('');

h2('9. Review / Q&A 真实痛点挖掘');
const themeRows = (key) => successfulEntities.flatMap((item) => arr(reviewOf(item)[key]).map((theme) => [item.asin, quoteEvidence(theme?.theme || theme?.text || theme, 120), theme?.frequency || '-', theme?.observedCount ?? theme?.evidenceCount ?? theme?.count ?? 0, one(theme?.evidenceSummary || objectRefs(theme).join('；') || '-', 160)]));
h3('正向购买动机');
const positiveRows = themeRows('positiveThemes');
positiveRows.length ? table(['ASIN', '主题', '频率', '样本证据数', '证据摘要'], positiveRows.slice(0, 24)) : bullet('当前 Review 样本不足，未形成可靠正向主题。');
h3('负面主题与购买障碍');
const negativeRows = themeRows('negativeThemes');
negativeRows.length ? table(['ASIN', '主题', '频率', '样本证据数', '证据摘要'], negativeRows.slice(0, 24)) : bullet('当前样本未提取到可靠负面主题，不能据此判断“没有痛点”。');
h3('跨竞品 Review 策略');
uniqueText(reviewStrategy.sharedPainPoints, reviewStrategy.purchaseBarriers, reviewStrategy.productValidationNeeds).slice(0, 12).forEach(bullet);
h3('高频 Q&A / FAQ 优先级');
const questions = successfulEntities.flatMap((item) => arr(reviewOf(item).frequentQuestions).map((question) => [item.asin, quoteEvidence(question.question || question.text || '', 120), one(question.answerSummary || question.answer || '-', 140), question.source || '-', question.evidenceCount ?? question.count ?? 0])).filter((row) => row[1]);
if (questions.length) table(['ASIN', '问题', '答案摘要', '来源', '证据条数'], questions.slice(0, 20));
else {
  bullet('本批次没有可用 Q&A 正文，不生成推测性问答。以下仅为待验证 FAQ 方向：');
  uniqueText(reviewStrategy.faqPriorities).slice(0, 8).forEach(bullet);
}

h2('10. 合规与经营风险');
if (riskObjects.length) table(['优先级', '我方风险', '传导关系 / 行动', '证据', '来源 ASIN'], riskObjects.slice(0, 12).map((item) => [item.priority || '待确认', item.insight || item.text || '-', item.action || '-', objectRefs(item).join('；') || '-', arr(item.sourceAsins).join(', ') || '-']));
else riskTexts.slice(0, 12).forEach(bullet);
uniqueText(imageStrategy.complianceNotes, titleStrategy.mustVerify, keywordStrategy.mustVerify).slice(0, 12).forEach((item) => bullet(`待核验：${item}`));
bullet('A+ / 视频状态为“数据源未返回/待确认”时，只能写待补抓，不能改写成明确缺失。');
bullet('所有参数、认证、销量、年份、效果和比较宣称必须与实际产品及可追溯材料一致。');
lines.push('');

h2('11. Listing 改版方向');
const titleFormula = clean(titleStrategy.recommendedFormula || ownAnalysis.titleAnalysis?.recommendedDirection || ownAnalysis.listingSuggestionsForOwnProduct?.titleDirection);
const titleLength = Array.from(titleFormula).length;
h3('标题方向（日本站 75 字符检查线）');
if (titleFormula) {
  bullet(`建议标题候选：${titleFormula}`);
  bullet(`候选长度：${titleLength} 字符；${titleLength > 75 ? '超过检查线，发布前必须继续压缩。' : '未超过检查线，仍需按类目政策和日语自然度复核。'}`);
}
if (titleStrategy.recommendedDirection) bullet(`改写原则：${titleStrategy.recommendedDirection}`);
uniqueText(titleStrategy.ownGaps).slice(0, 8).forEach((item) => bullet(`当前缺口：${item}`));
h3('关键词策略');
table(['层级', '候选词'], [
  ['核心词', uniqueText(keywordStrategy.core).join('、') || '-'],
  ['功能词', uniqueText(keywordStrategy.feature).join('、') || '-'],
  ['场景词', uniqueText(keywordStrategy.scenario).join('、') || '-'],
  ['长尾词', uniqueText(keywordStrategy.longTail).join('、') || '-'],
  ['后台候选', uniqueText(keywordStrategy.backendCandidates).join('、') || '-'],
  ['禁止 / 排除', uniqueText(keywordStrategy.negativeOrRestricted).join('、') || '-'],
]);
h3('五点描述');
const bulletDirections = uniqueText(ownAnalysis.listingSuggestionsForOwnProduct?.bulletDirections, successfulCompetitors.flatMap((item) => arr(analysisOf(item).listingSuggestionsForOwnProduct?.bulletDirections)));
(bulletDirections.length ? bulletDirections : ['第一点说明核心购买理由与可验证证据。', '第二点说明关键结构、规格或材质。', '第三点说明主要使用场景与适用边界。', '第四点说明清洁、维护和注意事项。', '第五点说明包装、售后与可信背书。']).slice(0, 8).forEach(bullet);
h3('A+ / FAQ');
uniqueText(imageStrategy.ownPriorities, reviewStrategy.faqPriorities, ownAnalysis.listingSuggestionsForOwnProduct?.aplusDirections, ownAnalysis.listingSuggestionsForOwnProduct?.faqDirections).slice(0, 14).forEach(bullet);

h2('12. P0 / P1 / P2 执行清单');
if (actionObjects.length) table(['ID', '优先级', '负责人', '行动', '原因', '验收指标', '证据'], actionObjects.slice(0, 20).map((item) => [item.id || '-', item.priority || '待确认', item.owner || '-', item.action || item.insight || '-', one(item.reason || '-', 160), one(item.successMetric || '-', 160), objectRefs(item).join('；') || '-']));
else {
  h3('待确认');
  bullet('批次综合分析未返回结构化行动计划，请先补齐证据后再排期。');
}

h2('13. 失败 / 待补抓');
if (failed.length) failed.forEach((value) => { const [asin, type, reason] = value.split('|'); bullet(`${asin}：${type} - ${reason}`); });
else bullet('无。');
lines.push('');

h2('14. 数据与方法说明');
const wikiArchivePath = `${ri.finalWikiPath || root.finalWikiPath || ''}/runs/${ri.runId || root.runId || ''}`.replace(/\/+$/g, '');
bullet(`报告版本：v4.1-evidence-linked-renderer；单品提示 ${synthesis.promptVersion || 'amazon-run-synthesis-v1'}；综合模型 ${synthesis.model || '待确认'}。`);
bullet('单品结果保持严格 JSON；批次级 AI 只生成统一评分与经营策略；Wiki 和 HTML 由确定性代码渲染。');
bullet('Data Table 唯一键保持 runId / ownAsin / competitorAsin；未知状态不转换为明确缺失。');
bullet(`我方子页面：${own?.wikiPath || `${ri.finalWikiPath}/own-listing`}；竞品子页面：${ri.finalWikiPath}/items/{competitorAsin}。`);
if (wikiArchivePath) bullet(`本次 Wiki 归档路径：${wikiArchivePath}。`);
bullet(`HTML 不可变运行归档：${root.htmlArchiveUrl || '发布 HTML 后写入'}。`);
bullet('Review 为样本分析，不代表全量评论占比；逐图视觉结论严格以 Gemini 实际读取到的像素为边界。');

return [{ json: { ...root, text: lines.join('\n'), reportVersion: 'v4.1-evidence-linked-renderer' } }];
