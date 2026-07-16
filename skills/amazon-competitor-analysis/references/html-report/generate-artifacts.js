const source = $('When called by orchestrator').first().json || {};
const ri = source.reportInput && typeof source.reportInput === 'object' ? source.reportInput : {};
const marketSynthesis = ri.marketSynthesis && typeof ri.marketSynthesis === 'object' ? ri.marketSynthesis : {};
const ownDecision = marketSynthesis.ownDecision && typeof marketSynthesis.ownDecision === 'object' ? marketSynthesis.ownDecision : {};
const prepared = $('Prepare image tasks').all().map((item) => item.json || {});
const built = $('Build image binaries').all().map((item) => item.json || {});
const uploadResults = $input.all().map((item) => item.json || {});
const config = prepared[0]?.config || {};
const clean = (value) => String(value ?? '').trim();
const isV2 = clean(config.styleVersion).toLowerCase() === 'v2';
const REPORT_CSS = isV2 && typeof REPORT_CSS_V2 !== 'undefined' ? REPORT_CSS_V2 : (typeof REPORT_CSS_V1 !== 'undefined' ? REPORT_CSS_V1 : '');
const parseMaybe = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const escapeHtml = (value) => clean(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const safeUrl = (value) => /^https?:\/\//i.test(clean(value)) ? clean(value).replace(/"/g, '%22') : '';
const formatValue = (value, fallback = '待确认') => {
  if (value === false) return '否';
  if (value === true) return '是';
  if (value === 0) return '0';
  return clean(value) || fallback;
};
const numericValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = clean(value).replace(/,/g, '');
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};
const reviewCountNumeric = (value) => {
  const text = clean(value).replace(/,/g, '');
  if (!text) return null;
  const match = text.match(/([\d.]+)\s*(万|千)?/i);
  if (!match) return numericValue(text);
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  if (match[2] === '万') return Math.round(base * 10000);
  if (match[2] === '千') return Math.round(base * 1000);
  return Math.round(base);
};
const flattenText = (value, output = []) => {
  if (value === null || value === undefined || value === '') return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = clean(value);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) flattenText(entry, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const key of ['text', 'title', 'theme', 'keyword', 'term', 'value', 'point', 'insight', 'action', 'pattern', 'adaptationForOwn', 'summary', 'message', 'label']) {
      if (value[key]) flattenText(value[key], output);
    }
  }
  return output;
};
const uniqueText = (...values) => {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    for (const text of flattenText(value, [])) {
      const normalized = text.replace(/\s+/g, ' ').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push(normalized);
    }
  }
  return output;
};
const pick = (object, keys, fallback = undefined) => {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
  }
  return fallback;
};
const statusLabel = (value, count, kind) => {
  const normalized = clean(value).toLowerCase();
  if (count > 0 || ['present', 'available', 'true', 'yes'].includes(normalized)) return { label: `${kind} 有数据`, tone: 'good' };
  if (['absent', 'false', 'no', 'none'].includes(normalized)) return { label: `${kind} 未发现`, tone: 'warn' };
  return { label: `${kind} 数据源未返回/待确认`, tone: 'warn' };
};
const videoLabel = (value) => {
  if (value === true || clean(value).toLowerCase() === 'present') return { label: '视频 有', tone: 'good' };
  if (value === false || clean(value).toLowerCase() === 'absent') return { label: '视频 未发现', tone: 'warn' };
  return { label: '视频 数据源未返回/待确认', tone: 'warn' };
};
const imageRecords = prepared.map((task, index) => {
  const result = uploadResults[index] || {};
  const build = built[index] || task;
  const uploaded = result.success === true && !result.error;
  return {
    ...task,
    sourceFetchStatus: build.sourceFetchStatus || 'unknown',
    uploadStatus: uploaded ? 'success' : 'failed',
    displayUrl: uploaded ? task.publicUrl : task.sourceUrl,
    error: uploaded ? '' : clean(result.error?.message || result.message || 's3_upload_failed'),
  };
});
const imageBySource = new Map(imageRecords.filter((item) => item.sourceUrl).map((item) => [item.sourceUrl, item.displayUrl]));
const imagesByAsin = new Map();
for (const image of imageRecords) {
  if (!imagesByAsin.has(image.asin)) imagesByAsin.set(image.asin, []);
  imagesByAsin.get(image.asin).push(image);
}

const entities = [];
if (ri.ownBaseline) entities.push({ ...ri.ownBaseline, itemRole: 'own' });
for (const item of Array.isArray(ri.items) ? ri.items : []) entities.push({ ...item, itemRole: item.itemRole || 'competitor' });
const normalizedEntities = entities.map((entity) => {
  const analysis = parseMaybe(entity.analysis || entity.analysisJson || {});
  const listing = parseMaybe(analysis.listing || analysis.listingData || analysis.product || {});
  const visual = parseMaybe(analysis.imageStrategyAnalysis || analysis.visualAnalysis || {});
  const reviewMining = parseMaybe(analysis.reviewMining || analysis.reviews || {});
  const assetCompleteness = parseMaybe(analysis.assetCompleteness || listing.assetCompleteness || {});
  const scorecard = parseMaybe(entity.scorecard || entity.productScorecard || analysis.scorecard || analysis.productScorecard || analysis.competitiveScorecard || {});
  const dataQuality = parseMaybe(entity.dataQuality || analysis.dataQuality || {});
  const asin = clean(entity.asin || entity.competitorAsin || listing.asin) || 'unknown';
  const cachedImages = imagesByAsin.get(asin) || [];
  const mainImage = cachedImages.find((item) => item.assetRole === 'main') || cachedImages[0] || null;
  const imageAplus = parseMaybe(analysis.imageAplus || analysis.imageStrategy || {});
  const visualResults = Array.isArray(visual.results) ? visual.results : [];
  const visualEvidence = visualResults.map((result, index) => {
    const sourceUrl = clean(result.url || result.normalizedUrl);
    const cached = cachedImages.find((image) => image.sourceUrl === sourceUrl || image.sourceUrl === clean(result.normalizedUrl));
    const ocrText = uniqueText(
      result.ocrText,
      result.ocr,
      result.recognizedText,
      result.detectedText,
      result.visibleText,
      result.textRegions,
    ).slice(0, 10);
    const visibleElements = uniqueText(result.visibleObjects, result.evidence).slice(0, 8);
    const visibleClaims = uniqueText(result.visibleClaims).slice(0, 8);
    return {
      ...result,
      index: Number(result.position ?? index),
      displayUrl: cached?.displayUrl || sourceUrl,
      role: clean(result.role || result.imageType || 'image'),
      coreMessage: clean(result.coreMessage || result.useCase || ''),
      ocrText,
      visibleElements,
      visibleClaims,
      observations: uniqueText(visibleElements, visibleClaims).slice(0, 8),
      strengths: uniqueText(result.conversionStrengths).slice(0, 5),
      referencePatterns: uniqueText(result.borrowablePatterns, result.transferableExpression).slice(0, 5),
      opportunities: uniqueText(result.ownProductImplication, result.opportunities).slice(0, 5),
      risks: uniqueText(result.doNotCopy, result.risks, result.complianceRisks).slice(0, 5),
      funnelStage: clean(result.funnelStage || 'unknown'),
      claimEvidenceQuality: clean(result.claimEvidenceQuality || 'none'),
      ocrConfidence: numericValue(result.ocrConfidence),
      scores: result.scores || {},
    };
  });
  const visualObservations = uniqueText(imageAplus.observations, visualEvidence.map((result) => result.coreMessage)).slice(0, 6);
  const visualStrengths = uniqueText(imageAplus.strengths, imageAplus.conversionStrengths, imageAplus.borrowablePatterns, visualEvidence.flatMap((result) => result.strengths), visualEvidence.flatMap((result) => result.referencePatterns), analysis.sellingPoints).slice(0, 8);
  const visualOpportunities = uniqueText(imageAplus.conversionFunnelGaps, visualEvidence.flatMap((result) => result.opportunities)).slice(0, 6);
  const visualRisks = uniqueText(imageAplus.missingContent, visualEvidence.flatMap((result) => result.risks)).slice(0, 6);
  const aplusCount = Number(entity.aplusImageCount ?? listing.aplusImageCount ?? analysis.aplusImageCount ?? cachedImages.filter((item) => item.assetRole === 'aplus').length) || 0;
  const imageCount = Number(entity.imageCount ?? listing.imageCount ?? analysis.imageCount ?? cachedImages.filter((item) => item.assetRole !== 'aplus').length) || 0;
  return {
    raw: entity,
    analysis,
    listing,
    visual,
    reviewMining,
    assetCompleteness,
    itemRole: entity.itemRole || 'competitor',
    asin,
    url: safeUrl(entity.url || entity.competitorUrl || listing.url),
    brand: formatValue(entity.brand || listing.brand, '未返回'),
    title: formatValue(entity.title || listing.title, '标题未返回'),
    price: formatValue(entity.price || listing.price, '未返回'),
    rating: formatValue(entity.rating || listing.rating, '未返回'),
    reviewCount: formatValue(entity.reviewCount ?? listing.reviewCount, '未返回'),
    priceNumeric: numericValue(entity.priceNumeric ?? listing.priceNumeric ?? entity.price ?? listing.price),
    ratingNumeric: numericValue(entity.ratingNumeric ?? listing.ratingNumeric ?? entity.rating ?? listing.rating),
    reviewCountNumeric: reviewCountNumeric(entity.reviewCountNumeric ?? listing.reviewCountNumeric ?? entity.reviewCount ?? listing.reviewCount),
    salesRank: formatValue(entity.salesRank || listing.salesRank, '未返回'),
    prime: entity.prime ?? listing.prime,
    imageCount,
    aplusCount,
    hasVideo: entity.hasVideo ?? listing.hasVideo ?? analysis.hasVideo,
    aplusStatus: pick(assetCompleteness, ['aplusStatus', 'aPlusStatus', 'aplus'], pick(analysis, ['aplusStatus', 'aPlusStatus'], '')),
    videoStatus: pick(assetCompleteness, ['videoStatus', 'video'], pick(analysis, ['videoStatus'], '')),
    mainImageUrl: mainImage?.displayUrl || '',
    images: cachedImages,
    visualEvidence,
    visualObservations,
    visualStrengths,
    visualOpportunities,
    visualRisks,
    visualStatus: clean(visual.status || imageAplus.visualStatus || ''),
    visualAnalyzedImageCount: Number(visual.analyzedImageCount ?? imageAplus.visualAnalyzedImageCount ?? visualEvidence.length) || 0,
    visualFailedImageCount: Number(visual.failedImageCount ?? imageAplus.visualFailedImageCount ?? 0) || 0,
    visualCacheHitCount: Number(visual.cacheHitCount ?? imageAplus.visualCacheHitCount ?? 0) || 0,
    scorecard,
    score: numericValue(entity.score ?? entity.competitiveScore ?? scorecard.totalScore ?? scorecard.score ?? analysis.competitiveScore),
    dataQuality,
    sellingPoints: uniqueText(analysis.sellingPoints, analysis.keySellingPoints, listing.bullets, listing.features, visual.sellingPoints).slice(0, 8),
    opportunities: uniqueText(analysis.opportunities, analysis.opportunityPoints, analysis.listingOpportunities, analysis.differentiationOpportunities, analysis.gaps).slice(0, 8),
    risks: uniqueText(analysis.risks, analysis.riskPoints, analysis.complianceRisks, analysis.weaknesses).slice(0, 8),
    keywords: uniqueText(analysis.keywords, analysis.keywordStrategy, listing.keywords, analysis.searchTerms).slice(0, 18),
    painPoints: uniqueText(reviewMining.negativeThemes, reviewMining.painPoints, reviewMining.complaints, analysis.reviewPainPoints).slice(0, 8),
    positiveThemes: uniqueText(reviewMining.positiveThemes, reviewMining.praiseThemes, analysis.reviewPositiveThemes).slice(0, 6),
  };
});

const inlineMarkdown = (value) => {
  const imageParts = [];
  const imageToken = (src, alt = '报告图片') => {
    const safeSource = safeUrl(src);
    if (!safeSource) return '';
    const token = `__REPORT_IMAGE_${imageParts.length}__`;
    imageParts.push({ token, html: `<img loading="lazy" src="${escapeHtml(safeSource)}" alt="${escapeHtml(alt || '报告图片')}">` });
    return token;
  };
  let sourceText = clean(value)
    .replace(/<img\b[^>]*>/gi, (tag) => imageToken(tag.match(/\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1], tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1]))
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (_, alt, src) => imageToken(src, alt));
  let text = escapeHtml(sourceText);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  for (const part of imageParts) text = text.split(part.token).join(part.html);
  return text;
};
const renderMarkdown = (markdown) => {
  const lines = clean(markdown).split(/\r?\n/);
  const html = [];
  let index = 0;
  let inCode = false;
  let code = [];
  let listType = '';
  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = '';
  };
  while (index < lines.length) {
    const line = lines[index];
    if (/^```/.test(line)) {
      closeList();
      if (!inCode) { inCode = true; code = []; }
      else { html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); inCode = false; code = []; }
      index += 1;
      continue;
    }
    if (inCode) { code.push(line); index += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || '')) {
      closeList();
      const rows = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(lines[index].trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
        index += 1;
      }
      const header = rows[0] || [];
      const body = rows.slice(2);
      html.push('<div class="table-wrap"><table><thead><tr>' + header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('') + '</tr></thead><tbody>' + body.map((row) => '<tr>' + row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const id = heading[2].replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();
      html.push(`<h${level} id="${escapeHtml(id)}">${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const wanted = unordered ? 'ul' : 'ol';
      if (listType !== wanted) { closeList(); listType = wanted; html.push(`<${wanted}>`); }
      html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`);
      index += 1;
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      closeList(); html.push('<hr>'); index += 1; continue;
    }
    if (!line.trim()) {
      closeList(); index += 1; continue;
    }
    closeList();
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^>|^```|^\s*\|.*\|\s*$/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
  }
  closeList();
  if (inCode) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return html.join('\n');
};

const tagsHtml = (entity) => {
  const aplus = statusLabel(entity.aplusStatus, entity.aplusCount, 'A+');
  const video = videoLabel(entity.hasVideo ?? entity.videoStatus);
  return [
    `<span class="tag brand">图片 ${entity.imageCount}</span>`,
    `<span class="tag ${aplus.tone}">${escapeHtml(aplus.label)}</span>`,
    `<span class="tag ${video.tone}">${escapeHtml(video.label)}</span>`,
  ].join('');
};
const productCards = normalizedEntities.map((entity) => `
  <article class="product-card ${entity.itemRole === 'own' ? 'own' : ''}" data-asin="${escapeHtml(entity.asin)}">
    <div class="product-image-wrap">
      ${entity.mainImageUrl ? `<img class="product-image" loading="lazy" src="${escapeHtml(entity.mainImageUrl)}" alt="${escapeHtml(entity.asin)} main image">` : '<div class="empty">主图未返回</div>'}
      <span class="role-badge">${entity.itemRole === 'own' ? '我方 Listing' : '竞品'}</span>
    </div>
    <div class="product-body">
      <div class="product-asin">${escapeHtml(entity.asin)} · ${escapeHtml(entity.brand)}</div>
      <div class="product-title">${escapeHtml(entity.title)}</div>
      <div class="metric-row">
        <div class="metric"><small>价格</small><strong>${escapeHtml(entity.price)}</strong></div>
        <div class="metric"><small>评分 / 评论</small><strong>${escapeHtml(entity.rating)} / ${escapeHtml(entity.reviewCount)}</strong></div>
        <div class="metric"><small>销售排名</small><strong>${escapeHtml(entity.salesRank)}</strong></div>
        <div class="metric"><small>Prime</small><strong>${escapeHtml(formatValue(entity.prime, '待确认'))}</strong></div>
      </div>
      <div class="asset-tags">${tagsHtml(entity)}</div>
      ${entity.url ? `<p><a href="${escapeHtml(entity.url)}" target="_blank" rel="noopener">查看 Amazon Listing →</a></p>` : ''}
    </div>
  </article>`).join('');

const comparisonRows = normalizedEntities.map((entity) => {
  const aplus = statusLabel(entity.aplusStatus, entity.aplusCount, 'A+').label;
  const video = videoLabel(entity.hasVideo ?? entity.videoStatus).label.replace('视频 ', '');
  return `<tr data-asin="${escapeHtml(entity.asin)}" data-price="${entity.priceNumeric ?? ''}" data-rating="${entity.ratingNumeric ?? ''}" data-review-count="${entity.reviewCountNumeric ?? ''}">
    <td><strong>${entity.itemRole === 'own' ? '我方' : '竞品'}</strong><br>${escapeHtml(entity.asin)}</td>
    <td>${escapeHtml(entity.brand)}</td>
    <td>${escapeHtml(entity.price)}</td>
    <td>${escapeHtml(entity.rating)}</td>
    <td>${escapeHtml(entity.reviewCount)}</td>
    <td>${entity.imageCount}</td>
    <td>${escapeHtml(aplus)}</td>
    <td>${escapeHtml(video)}</td>
  </tr>`;
}).join('');

const gallery = normalizedEntities.map((entity) => {
  const figures = entity.images.map((image) => `<figure><img loading="lazy" src="${escapeHtml(image.displayUrl)}" alt="${escapeHtml(entity.asin + ' ' + image.assetRole)}"><figcaption>${escapeHtml(image.assetRole)} · ${image.sourceFetchStatus === 'placeholder' ? '下载失败，使用占位图' : '已缓存到 MinIO'}</figcaption></figure>`).join('');
  return `<div class="gallery-group" data-asin="${escapeHtml(entity.asin)}"><h3 class="gallery-title"><span class="tag ${entity.itemRole === 'own' ? 'brand' : ''}">${entity.itemRole === 'own' ? '我方' : '竞品'}</span>${escapeHtml(entity.asin)} · 商品图 / A+ 图</h3>${figures ? `<div class="gallery">${figures}</div>` : '<div class="empty">数据源未返回可缓存图片</div>'}</div>`;
}).join('');

const scoreValue = (entity) => entity.score === null || entity.score === undefined ? null : Math.max(0, Math.min(100, Number(entity.score)));
const ownEntity = normalizedEntities.find((entity) => entity.itemRole === 'own');
const ownEntities = ownEntity ? [ownEntity] : [];
const competitorEntities = normalizedEntities.filter((entity) => entity.itemRole !== 'own');
const allOpportunities = uniqueText(...normalizedEntities.map((entity) => entity.opportunities)).slice(0, 10);
const allRisks = uniqueText(...normalizedEntities.map((entity) => entity.risks)).slice(0, 10);
const allKeywords = uniqueText(...normalizedEntities.map((entity) => entity.keywords)).slice(0, 24);
const allPainPoints = uniqueText(...normalizedEntities.map((entity) => entity.painPoints)).slice(0, 10);
const listHtml = (values, emptyText) => values.length ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : `<div class="empty">${escapeHtml(emptyText)}</div>`;
const charLength = (value) => Array.from(clean(value)).length;
const normalizeTerm = (value) => clean(value).toLowerCase().replace(/[\s　]+/g, ' ').trim();
const tokenizeListingText = (value) => clean(value)
  .replace(/[\[\]【】()（）「」『』|｜/／・,，、。:：;；!！?？+＋~〜#]/g, ' ')
  .split(/[\s　]+/)
  .map((term) => clean(term))
  .filter((term) => term.length >= 2 && term.length <= 28 && !/^B0[A-Z0-9]{8}$/i.test(term) && !/^https?:/i.test(term));
const topTerms = (values, limit = 10) => {
  const counts = new Map();
  for (const value of values) {
    for (const term of tokenizeListingText(value)) {
      const key = normalizeTerm(term);
      if (!key) continue;
      const previous = counts.get(key) || { term, count: 0 };
      previous.count += 1;
      counts.set(key, previous);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'ja')).slice(0, limit);
};
const keywordTermsFor = (entity) => uniqueText(
  entity?.keywords,
  entity?.analysis?.keywords,
  entity?.analysis?.keywordStrategy,
  entity?.analysis?.searchTerms,
  entity?.listing?.keywords,
).slice(0, 24);
const chipListHtml = (values, emptyText) => values.length
  ? `<div class="keyword-chip-list">${values.map((value) => `<span class="keyword-chip">${escapeHtml(value)}</span>`).join('')}</div>`
  : `<div class="empty compact">${escapeHtml(emptyText)}</div>`;

const priorityRank = { P0: 0, P1: 1, P2: 2, '待确认': 3 };
const normalizePriority = (value, kind, text) => {
  const raw = clean(value).toUpperCase();
  if (/P0|紧急|严重|高风险|高优先/.test(raw)) return 'P0';
  if (/P2|低风险|低优先|后续/.test(raw)) return 'P2';
  if (/待确认|未知|缺失证据|待验证/.test(raw)) return '待确认';
  if (kind === 'risk' && /(合规|侵权|虚假|绝对化|认证|夸大)/.test(text)) return 'P0';
  return 'P1';
};
const insightText = (value) => typeof value === 'object'
  ? uniqueText(value.insight, value.action, value.point, value.title, value.summary, value.message, value.text, value.label, value.value)[0] || ''
  : uniqueText(value)[0] || '';
const insightItemsFrom = (values, entity, kind, defaultSource) => {
  const flattenValues = (value) => Array.isArray(value)
    ? value.flatMap((child) => flattenValues(child))
    : value === null || value === undefined || value === '' ? [] : [value];
  const list = flattenValues(values);
  return list.map((value) => {
    const text = insightText(value);
    if (!text) return null;
    const object = value && typeof value === 'object' ? value : {};
    const evidenceRefs = uniqueText(object.evidenceRefs, object.evidencePaths, object.dataSource).slice(0, 8);
    const evidence = uniqueText(object.evidence, evidenceRefs, object.basis, object.reason, object.impact)[0] || '';
    const action = uniqueText(object.action, object.recommendation, object.suggestion, object.nextStep, object.fix, object.applicability)[0] || '';
    const source = uniqueText(object.source, object.category, object.type)[0] || defaultSource;
    const confidence = clean(object.confidence || object.evidenceStatus || '') || 'medium';
    return {
      text,
      kind,
      priority: normalizePriority(object.priority || object.level || object.severity || object.urgency, kind, text),
      evidence,
      action,
      source,
      confidence,
      id: clean(object.id),
      asin: entity.asin,
      sourceAsins: uniqueText(object.sourceAsins),
      itemRole: entity.itemRole,
      evidenceRefs,
      businessImpact: clean(object.businessImpact),
      effort: clean(object.effort),
      owner: clean(object.owner),
      successMetric: clean(object.successMetric),
    };
  }).filter(Boolean);
};
const mergeInsightItems = (items) => {
  const merged = new Map();
  for (const item of items) {
    const key = item.text.replace(/\s+/g, ' ').trim();
    if (!key) continue;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...item, asins: uniqueText(item.asin, item.sourceAsins), sources: [item.source] });
      continue;
    }
    previous.priority = (priorityRank[item.priority] ?? 9) < (priorityRank[previous.priority] ?? 9) ? item.priority : previous.priority;
    previous.evidence ||= item.evidence;
    previous.evidenceRefs = uniqueText(previous.evidenceRefs, item.evidenceRefs).slice(0, 8);
    previous.action ||= item.action;
    previous.owner ||= item.owner;
    previous.successMetric ||= item.successMetric;
    previous.confidence = previous.confidence === 'high' || item.confidence === 'high' ? 'high' : previous.confidence;
    if (item.asin && !previous.asins.includes(item.asin)) previous.asins.push(item.asin);
    if (item.source && !previous.sources.includes(item.source)) previous.sources.push(item.source);
  }
  return [...merged.values()].sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || (b.confidence === 'high' ? 1 : 0) - (a.confidence === 'high' ? 1 : 0));
};
const opportunityItems = mergeInsightItems(normalizedEntities.flatMap((entity) => insightItemsFrom(
  [entity.analysis?.opportunityPoints, entity.analysis?.opportunities, entity.opportunities, entity.visualOpportunities],
  entity,
  'opportunity',
  entity.itemRole === 'own' ? '我方 Listing' : '竞品 Listing',
)));
const riskItems = mergeInsightItems(normalizedEntities.flatMap((entity) => insightItemsFrom(
  [entity.analysis?.riskPoints, entity.analysis?.risks, entity.risks, entity.visualRisks],
  entity,
  'risk',
  entity.itemRole === 'own' ? '我方 Listing' : '竞品 Listing',
)));
// 经营决策总览只回答“我方现在要做什么”，因此机会、风险和行动计划
// 只从 ownEntity 提取。竞品洞察仍保留在竞争格局、图片证据墙和完整报告中。
const ownDecisionEntity = ownEntity || { asin: clean(ri.ownAsin), itemRole: 'own' };
const runLevelOpportunityItems = insightItemsFrom(ownDecision.opportunities, ownDecisionEntity, 'opportunity', '批次综合分析');
const itemLevelOwnOpportunityItems = ownEntities.flatMap((entity) => insightItemsFrom(
    [entity.analysis?.opportunityPoints, entity.analysis?.opportunities, entity.opportunities, entity.visualOpportunities],
    entity,
    'opportunity',
    '我方 Listing',
  ));
const ownOpportunityItems = mergeInsightItems(runLevelOpportunityItems.length ? runLevelOpportunityItems : itemLevelOwnOpportunityItems);
const runLevelRiskItems = insightItemsFrom(ownDecision.risks, ownDecisionEntity, 'risk', '批次综合分析');
const itemLevelOwnRiskItems = ownEntities.flatMap((entity) => insightItemsFrom(
    [entity.analysis?.riskPoints, entity.analysis?.risks, entity.risks, entity.visualRisks],
    entity,
    'risk',
    '我方 Listing',
  ));
const ownRiskItems = mergeInsightItems(runLevelRiskItems.length ? runLevelRiskItems : itemLevelOwnRiskItems);
const explicitActions = normalizedEntities.flatMap((entity) => insightItemsFrom(
  [entity.analysis?.actionPlan, entity.analysis?.executionPlan, entity.analysis?.p0Actions, entity.analysis?.p1Actions, entity.analysis?.p2Actions],
  entity,
  'action',
  'AI 行动计划',
));
const runLevelActions = insightItemsFrom(ownDecision.actionPlan, ownDecisionEntity, 'action', '批次综合行动计划');
const ownExplicitActions = [...runLevelActions, ...explicitActions.filter((item) => item.itemRole === 'own')];
const actionItems = mergeInsightItems(ownExplicitActions.length ? ownExplicitActions : [
  ...ownOpportunityItems.slice(0, 6).map((item) => ({ ...item, kind: 'action', action: item.action || item.text, source: `机会 · ${item.source}` })),
  ...ownRiskItems.slice(0, 4).map((item) => ({ ...item, kind: 'action', action: item.action || item.text, source: `风险 · ${item.source}` })),
]);
const actionPriorities = ['P0', 'P1', 'P2', '待确认'];
const actionPriorityLabels = { P0: '立即处理', P1: '本周期处理', P2: '后续优化', '待确认': '先补证据' };
const visibleActionItemsByPriority = Object.fromEntries(actionPriorities.map((priority) => [priority, actionItems.filter((item) => item.priority === priority).slice(0, 3)]));
const visibleActionItemCount = actionPriorities.reduce((sum, priority) => sum + visibleActionItemsByPriority[priority].length, 0);
const titleRows = normalizedEntities.map((entity) => {
  const length = charLength(entity.title);
  const terms = topTerms([entity.title], 5).map((item) => item.term);
  return {
    asin: entity.asin,
    itemRole: entity.itemRole,
    title: entity.title,
    length,
    status: length > 75 ? '超过 75 字符' : length >= 55 ? '接近上限' : '空间可用',
    terms,
  };
});
const ownTitleRow = titleRows.find((row) => row.itemRole === 'own');
const competitorTitleRows = titleRows.filter((row) => row.itemRole !== 'own');
const competitorTitleTerms = topTerms(competitorTitleRows.map((row) => row.title), 12);
const ownTitleTermSet = new Set(topTerms([ownEntity?.title || ''], 30).map((item) => normalizeTerm(item.term)));
const titleOpportunityTerms = competitorTitleTerms.filter((item) => !ownTitleTermSet.has(normalizeTerm(item.term))).slice(0, 8).map((item) => `${item.term}${item.count > 1 ? ` ×${item.count}` : ''}`);
const averageCompetitorTitleLength = competitorTitleRows.length ? Math.round(competitorTitleRows.reduce((sum, row) => sum + row.length, 0) / competitorTitleRows.length) : null;
const titleAdvice = uniqueText([
  marketSynthesis.titleStrategy?.recommendedDirection,
  marketSynthesis.titleStrategy?.recommendedFormula,
  marketSynthesis.titleStrategy?.ownGaps,
  ownTitleRow?.length > 75 ? '我方标题已超过日本站建议的 75 字符上限，优先压缩重复修饰词与弱相关词。' : '日本 Amazon 标题建议控制在 75 字符内，把核心品类词、关键场景和差异化规格放在前半段。',
  titleOpportunityTerms.length ? `竞品标题中可借鉴的高频表达：${titleOpportunityTerms.slice(0, 5).join(' / ')}。` : '竞品标题未形成明显高频词，建议以品类核心词 + 场景 + 关键规格建立稳定结构。',
  '避免把未经证实的功效、绝对化承诺或合规敏感表达堆入标题；这类内容应放到有证据支撑的图片/A+或五点描述中。',
]).slice(0, 4);
const ownKeywordTerms = keywordTermsFor(ownEntity);
const competitorKeywordTerms = uniqueText(...competitorEntities.map((entity) => keywordTermsFor(entity))).slice(0, 40);
const ownKeywordSet = new Set(ownKeywordTerms.map((term) => normalizeTerm(term)));
const competitorKeywordHotTerms = topTerms([...competitorEntities.map((entity) => entity.title), ...competitorKeywordTerms], 18).map((item) => ({ ...item, covered: ownKeywordSet.has(normalizeTerm(item.term)) || normalizeTerm(ownEntity?.title || '').includes(normalizeTerm(item.term)) }));
const keywordOpportunityTerms = competitorKeywordHotTerms.filter((item) => !item.covered).slice(0, 10).map((item) => `${item.term}${item.count > 1 ? ` ×${item.count}` : ''}`);
const keywordAdvice = uniqueText([
  marketSynthesis.keywordStrategy?.mustVerify,
  ownKeywordTerms.length ? `我方已覆盖 ${ownKeywordTerms.length} 个结构化关键词，建议继续区分标题词、五点词和后台 Search Terms。` : '我方结构化关键词较少，建议先补齐核心品类词、使用场景词、材质/规格词和痛点词。',
  keywordOpportunityTerms.length ? `可优先补强竞品共现词：${keywordOpportunityTerms.slice(0, 8).join(' / ')}。` : '当前竞品关键词与我方覆盖差距不明显，建议通过 Review 痛点和搜索词报告继续补充长尾词。',
  '后台 Search Terms 更适合承接同义词、别称、拼写变体和低频长尾词，标题只保留能提升点击与相关性的高确定词。',
]).slice(0, 4);
const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const scoreRank = ownEntity && scoreValue(ownEntity) !== null ? [...normalizedEntities].filter((entity) => scoreValue(entity) !== null).sort((a, b) => scoreValue(b) - scoreValue(a)).findIndex((entity) => entity.asin === ownEntity.asin) + 1 : null;
const ownPriceMedian = ownEntity?.priceNumeric !== null && ownEntity?.priceNumeric !== undefined ? median(competitorEntities.map((entity) => entity.priceNumeric)) : null;
const ownReviewMedian = ownEntity?.reviewCountNumeric !== null && ownEntity?.reviewCountNumeric !== undefined ? median(competitorEntities.map((entity) => entity.reviewCountNumeric)) : null;
const decisionHeadline = clean(marketSynthesis.marketConclusion?.headline) || (ownEntity && scoreRank ? `我方综合竞争力排名第 ${scoreRank} / ${normalizedEntities.filter((entity) => scoreValue(entity) !== null).length}，需要优先补强转化证据与社会证明。` : '当前数据已完成结构化汇总，建议先处理高优先级机会，再补齐待确认证据。');
const decisionSignals = [
  scoreRank ? `综合评分排名：第 ${scoreRank} 位` : '综合评分：待确认',
  ownPriceMedian !== null ? `价格相对竞品中位数：${ownEntity.priceNumeric > ownPriceMedian ? '高于' : '低于'} ${Math.abs(Math.round((ownEntity.priceNumeric / ownPriceMedian - 1) * 100))}%` : '价格位置：待确认',
  ownReviewMedian !== null ? `评论量相对竞品中位数：${ownEntity.reviewCountNumeric >= ownReviewMedian ? '不低于' : '低于'}市场中位数` : '评论规模：待确认',
  ownEntity ? `素材覆盖：${ownEntity.imageCount || 0} 张商品图 · A+ ${ownEntity.aplusCount || '待确认'}` : '我方 Listing：待确认',
];
const confidenceLabel = (value) => ({ high: '高', medium: '中', low: '低', observed: '高', inferred: '中', missing: '低' }[clean(value).toLowerCase()] || '中');
const anchorSafe = (value) => clean(value).replace(/[^A-Za-z0-9_-]/g, '-');
const evidenceAnchor = (item) => {
  const refs = uniqueText(item.evidenceRefs, item.evidence);
  const sourceAsin = uniqueText(item.sourceAsins, item.asins, item.asin).find((value) => /^B0[A-Z0-9]{8}$/i.test(value)) || ownEntity?.asin || '';
  const visualRef = refs.map((value) => clean(value).match(/visualAnalysis\.results\[(\d+)\]/i)).find(Boolean);
  if (visualRef && sourceAsin) return `#asin-${anchorSafe(sourceAsin)}-image-${Number(visualRef[1]) + 1}`;
  if (refs.some((value) => /reviewMining|review|qa/i.test(value))) return '#review-insights';
  if (refs.some((value) => /listing\.title|titleAnalysis|keywords/i.test(value))) return '#listing-text';
  if (refs.some((value) => /listing\.(price|rating|reviewCount|imageCount|aplusStatus|videoStatus)/i.test(value))) return '#matrix';
  if (/图片|A\+|视觉/.test(`${item.source}${item.text}`)) return sourceAsin ? `#asin-${anchorSafe(sourceAsin)}` : '#gallery';
  return '#full-report';
};
const insightItemHtml = (item, options = {}) => `<li class="decision-insight-item"${item.id ? ` id="${escapeHtml(anchorSafe(item.id))}"` : ''}><div class="decision-insight-top"><span class="priority-badge priority-${item.priority === '待确认' ? 'unknown' : item.priority.toLowerCase()}">${escapeHtml(item.priority)}</span><strong>${escapeHtml(item.text)}</strong></div><div class="decision-insight-meta"><span>${escapeHtml(item.source)}${item.asins?.length ? ` · ${escapeHtml(item.asins.join(', '))}` : ''}</span><span>证据置信度：${confidenceLabel(item.confidence)}</span></div>${item.evidence ? `<p class="decision-insight-evidence">证据：${escapeHtml(item.evidence)}</p>` : ''}${options.action && item.action ? `<p class="decision-insight-action">行动：${escapeHtml(item.action)}</p>` : ''}<a class="decision-insight-link" href="${evidenceAnchor(item)}">定位具体证据 →</a></li>`;
const insightCardHtml = (id, title, items, kind, emptyText) => {
  const top = items.slice(0, 3);
  const rest = items.slice(3);
  return `<article class="decision-insight-card" id="${id}"><div class="decision-card-head"><div><span class="eyebrow">${kind === 'risk' ? '风险控制' : '增长机会'}</span><h3>${escapeHtml(title)}</h3></div><span class="decision-count">共 ${items.length} 项 · P0 ${items.filter((item) => item.priority === 'P0').length} · P1 ${items.filter((item) => item.priority === 'P1').length}</span></div>${top.length ? `<ul class="decision-insight-list">${top.map((item) => insightItemHtml(item)).join('')}</ul>` : `<div class="empty">${escapeHtml(emptyText)}</div>`}${rest.length ? `<details class="decision-more"><summary>查看全部 ${items.length} 项</summary><ul class="decision-insight-list">${items.map((item) => insightItemHtml(item)).join('')}</ul></details>` : ''}</article>`;
};
let markdown = clean(source.markdown || source.report || '');
for (const [sourceUrl, cachedUrl] of imageBySource.entries()) markdown = markdown.split(sourceUrl).join(cachedUrl);
const markdownHtml = renderMarkdown(markdown);
const generatedAt = clean(ri.generatedAt || source.generatedAt) || new Date().toISOString();
const wikiPath = clean(source.wikiPath || ri.finalWikiPath);
const wikiUrl = clean(source.wikiLink) || (wikiPath ? `https://wiki.dinve.com/zh/${wikiPath.replace(/^\/+/, '')}` : '');
const successfulImages = imageRecords.filter((item) => item.uploadStatus === 'success').length;
const placeholderImages = imageRecords.filter((item) => item.sourceFetchStatus === 'placeholder').length;
const scoredEntityCount = normalizedEntities.filter((entity) => scoreValue(entity) !== null).length;
const expectedEntityCount = Math.max(1, Number(ri.expectedItemCount || normalizedEntities.length || 1));
const itemCoverage = Math.min(1, (Number(ri.successCount || competitorEntities.length) + (ownEntity ? 1 : 0)) / expectedEntityCount);
const scoreCoverages = normalizedEntities.map((entity) => numericValue(entity.scorecard?.coverage)).filter((value) => value !== null);
const scoreCoverage = scoreCoverages.length ? scoreCoverages.reduce((sum, value) => sum + value, 0) / scoreCoverages.length : 0;
const visualAnalyzedTotal = normalizedEntities.reduce((sum, entity) => sum + Number(entity.visualAnalyzedImageCount || 0), 0);
const visualFailedTotal = normalizedEntities.reduce((sum, entity) => sum + Number(entity.visualFailedImageCount || 0), 0);
const visualCoverage = visualAnalyzedTotal + visualFailedTotal > 0 ? visualAnalyzedTotal / (visualAnalyzedTotal + visualFailedTotal) : 0;
const knownAssetStatus = (value) => ['present', 'absent', 'partial', 'available', 'true', 'false'].includes(clean(value).toLowerCase());
const assetKnownCount = normalizedEntities.reduce((sum, entity) => sum + Number(knownAssetStatus(entity.aplusStatus)) + Number(knownAssetStatus(entity.videoStatus)), 0);
const assetCoverage = normalizedEntities.length ? assetKnownCount / (normalizedEntities.length * 2) : 0;
const qualityComponents = [itemCoverage, scoreCoverage, visualCoverage, assetCoverage].filter((value) => Number.isFinite(value));
const dataCoveragePercent = Math.round((qualityComponents.reduce((sum, value) => sum + value, 0) / Math.max(1, qualityComponents.length)) * 100);
const dataQualitySummary = {
  coveragePercent: dataCoveragePercent,
  itemCoverage: Math.round(itemCoverage * 100),
  scoreCoverage: Math.round(scoreCoverage * 100),
  visualCoverage: Math.round(visualCoverage * 100),
  assetCoverage: Math.round(assetCoverage * 100),
  synthesisStatus: clean(marketSynthesis.status || ri.dataQuality?.synthesisStatus || 'unknown'),
  limitations: uniqueText(marketSynthesis.evidenceLimits, marketSynthesis.marketConclusion?.dataQualityNotes, ri.evidenceLimits).slice(0, 4),
};
const decisionMetaItems = [
  `竞品 ${Number(ri.competitorCount || competitorEntities.length)} 个（成功 ${Number(ri.successCount || 0)} / 失败 ${Number(ri.failedCount || 0)}）`,
  scoreRank ? `我方综合评分第 ${scoreRank} / ${scoredEntityCount || normalizedEntities.length}` : '我方排名待确认',
  `我方机会 ${ownOpportunityItems.length} 项 · 风险 ${ownRiskItems.length} 项`,
  `图片缓存 ${successfulImages} 张 · 占位 ${placeholderImages} 张`,
  `数据覆盖 ${dataCoveragePercent}% · 综合 ${dataQualitySummary.synthesisStatus}`,
];
const reportTitle = clean(source.title) || `${config.ownAsin} - Amazon 竞品分析报告`;
const heroAsin = clean(config.ownAsin || ri.ownAsin) || 'Amazon';
const heroOwnImageHtml = ownEntity?.mainImageUrl
  ? `<div class="hero-product" aria-label="我方商品主图"><span class="hero-product-label">我方 Listing</span><img loading="eager" src="${escapeHtml(ownEntity.mainImageUrl)}" alt="${escapeHtml(heroAsin)} 我方商品主图"></div>`
  : '';
// CSS is published as a shared asset and browsers may retain the previous
// response for the same URL. Tie the stylesheet URL to this run so a newly
// generated report always picks up the current visual system.
const cssFingerprint = typeof REPORT_CSS === 'string'
  ? [...REPORT_CSS].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261).toString(16)
  : 'latest';
const cssVersion = encodeURIComponent(`${clean(config.runId || generatedAt) || 'latest'}-${cssFingerprint}`);
const cssHref = config.cssUrl ? `${config.cssUrl}${config.cssUrl.includes('?') ? '&' : '?'}v=${cssVersion}` : '';

const legacyHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Amazon 竞品分析可视化报告 ${escapeHtml(config.ownAsin)}">
  <title>${escapeHtml(reportTitle)}</title>
  <link rel="stylesheet" href="${escapeHtml(cssHref)}">
</head>
<body>
  <main class="shell">
    <header class="hero" id="top">
      <p class="hero-kicker">Amazon Competitor Intelligence · ${escapeHtml(ri.marketplace || 'amazon.co.jp')}</p>
      <h1>${escapeHtml(reportTitle)}</h1>
      <p class="hero-subtitle">从 Listing 基线、价格与口碑、图片/A+/视频漏斗，到关键词、风险和 P0/P1/P2 行动计划的一体化可视化报告。</p>
      <div class="hero-meta">
        <span>我方 ASIN ${escapeHtml(config.ownAsin)}</span>
        <span>Run ${escapeHtml(config.runId)}</span>
        <span>状态 ${escapeHtml(ri.status || 'unknown')}</span>
        <span>生成 ${escapeHtml(generatedAt)}</span>
        ${wikiUrl ? `<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener">Wiki 版本</a>` : ''}
      </div>
    </header>

    <nav class="quick-nav" aria-label="报告导航">
      <a href="#overview">总览</a><a href="#products">商品卡片</a><a href="#matrix">横向对比</a><a href="#funnel">转化漏斗</a><a href="#gallery">图片证据</a><a href="#insights">机会与风险</a><a href="#full-report">完整报告</a>
    </nav>

    <section class="section" id="overview">
      <div class="section-head"><div><h2>经营决策总览</h2><p class="section-note">数据源未知不等于不存在；A+ 和视频 unknown 统一标为“数据源未返回/待确认”。</p></div></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">竞品数</div><div class="kpi-value">${Number(ri.competitorCount || 0)}</div><div class="kpi-note">成功 ${Number(ri.successCount || 0)} / 失败 ${Number(ri.failedCount || 0)}</div></div>
        <div class="kpi"><div class="kpi-label">我方 ASIN</div><div class="kpi-value">${escapeHtml(config.ownAsin)}</div><div class="kpi-note">${escapeHtml(ri.marketplace || 'amazon.co.jp')}</div></div>
        <div class="kpi"><div class="kpi-label">已缓存图片</div><div class="kpi-value">${successfulImages}</div><div class="kpi-note">占位图 ${placeholderImages}</div></div>
        <div class="kpi"><div class="kpi-label">机会点</div><div class="kpi-value">${allOpportunities.length}</div><div class="kpi-note">结构化结果去重</div></div>
        <div class="kpi"><div class="kpi-label">风险点</div><div class="kpi-value">${allRisks.length}</div><div class="kpi-note">经营与合规线索</div></div>
        <div class="kpi"><div class="kpi-label">关键词</div><div class="kpi-value">${allKeywords.length}</div><div class="kpi-note">候选词与表达方向</div></div>
      </div>
    </section>

    <section class="section" id="products">
      <div class="section-head"><div><h2>我方与竞品 Listing 卡片</h2><p class="section-note">主图优先缓存到 MinIO；失败时保留占位证据并记录状态。</p></div></div>
      <div class="product-grid">${productCards || '<div class="empty">没有可展示的 Listing 结果</div>'}</div>
    </section>

    <section class="section" id="matrix">
      <div class="section-head"><div><h2>核心指标横向对比</h2><p class="section-note">价格、评分、评论量和素材完整度用于快速识别竞争门槛。</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>角色 / ASIN</th><th>品牌</th><th>价格</th><th>评分</th><th>评论数</th><th>图片数</th><th>A+</th><th>视频</th></tr></thead><tbody>${comparisonRows}</tbody></table></div>
    </section>

    <section class="section" id="funnel">
      <div class="section-head"><div><h2>图片 / A+ / 视频转化漏斗</h2><p class="section-note">从点击吸引到信息解释、疑虑消除和品牌信任。</p></div></div>
      <div class="funnel-grid">
        <div class="funnel-step"><strong>1. 主图吸引点击</strong><p>轮廓、体积感、核心差异和移动端可读性决定搜索结果页点击。</p></div>
        <div class="funnel-step"><strong>2. 功能图讲清卖点</strong><p>把功能转译为日语消费者可理解的场景收益和证据。</p></div>
        <div class="funnel-step"><strong>3. 细节图降低疑虑</strong><p>尺寸、材质、操作、收纳、耐用性和适配边界减少犹豫与退货。</p></div>
        <div class="funnel-step"><strong>4. A+ / 视频建信任</strong><p>品牌故事、模块化对比和动态演示补足高客单决策信息。</p></div>
      </div>
    </section>

    <section class="section" id="gallery">
      <div class="section-head"><div><h2>图片与 A+ 证据墙</h2><p class="section-note">默认每个 ASIN 缓存 1 张主图、最多 ${Number(config.maxProductImages || 0)} 张商品图和 ${Number(config.maxAplusImages || 0)} 张 A+ 图。</p></div></div>
      ${gallery}
    </section>

    <section class="section" id="insights">
      <div class="section-head"><div><h2>结构化机会、风险与关键词</h2><p class="section-note">汇总自单竞品严格 JSON，供 Listing 改版与内容排期使用。</p></div></div>
      <div class="insight-grid">
        <div class="insight-card"><h3>差异化机会</h3>${listHtml(allOpportunities, '暂未返回结构化机会点')}</div>
        <div class="insight-card"><h3>风险与约束</h3>${listHtml(allRisks, '暂未返回结构化风险点')}</div>
        <div class="insight-card"><h3>Review / Q&A 痛点</h3>${listHtml(allPainPoints, '暂未返回可验证痛点')}</div>
      </div>
      <div class="asset-tags" style="margin-top:16px">${allKeywords.map((keyword) => `<span class="tag brand">${escapeHtml(keyword)}</span>`).join('') || '<span class="tag warn">关键词待补充</span>'}</div>
    </section>

    <section class="section" id="full-report">
      <div class="section-head"><div><h2>完整专业分析报告</h2><p class="section-note">与 Wiki 使用同一份最终报告正文，保留全部章节、证据限制和 P0/P1/P2 行动计划。</p></div><a href="#top">返回顶部 ↑</a></div>
      <article class="markdown-body">${markdownHtml || '<div class="empty">最终报告正文未返回</div>'}</article>
    </section>

    <footer class="footer"><span class="status-dot"></span> 报告由 Amazon competitor analysis v3.2 HTML renderer 生成。Run ID: ${escapeHtml(config.runId)}。图片缓存失败不会中断综合报告；失败原因保存在 manifest.json。</footer>
  </main>
</body>
</html>`;

const icon = (name, label = '') => config.iconUrl ? `<svg class="report-icon" aria-hidden="true"><use href="${escapeHtml(config.iconUrl)}#${escapeHtml(name)}"></use></svg>${label ? `<span>${escapeHtml(label)}</span>` : ''}` : (label ? escapeHtml(label) : '');
const scoreLabel = (entity) => scoreValue(entity) === null ? '待评分' : `${Math.round(scoreValue(entity))}`;
const scoringModel = ri.categoryScoringModel || marketSynthesis.categoryScoringModel || source.categoryScoringModel || null;
const imageStrategy = marketSynthesis.imageAplusStrategy && typeof marketSynthesis.imageAplusStrategy === 'object' ? marketSynthesis.imageAplusStrategy : {};
const productData = normalizedEntities.map((entity) => ({
  asin: entity.asin,
  itemRole: entity.itemRole,
  brand: entity.brand,
  title: entity.title,
  price: entity.price,
  priceNumeric: entity.priceNumeric,
  rating: entity.rating,
  ratingNumeric: entity.ratingNumeric,
  reviewCount: entity.reviewCount,
  reviewCountNumeric: entity.reviewCountNumeric,
  score: scoreValue(entity),
  scorecard: entity.scorecard || {},
  dataQuality: entity.dataQuality || {},
  visualStatus: entity.visualStatus || entity.visual?.status || entity.visual?.analysisStatus || '',
  visualAnalyzedImageCount: entity.visualAnalyzedImageCount || 0,
  visualFailedImageCount: entity.visualFailedImageCount || 0,
  visualCacheHitCount: entity.visualCacheHitCount || 0,
  visualObservations: entity.visualObservations || [],
  visualStrengths: entity.visualStrengths || [],
  visualOpportunities: entity.visualOpportunities || [],
  visualRisks: entity.visualRisks || [],
  visualEvidence: (entity.visualEvidence || []).map((result) => ({
    displayUrl: result.displayUrl,
    role: result.role,
    index: result.index,
    coreMessage: result.coreMessage,
    ocrText: result.ocrText,
    visibleElements: result.visibleElements,
    visibleClaims: result.visibleClaims,
    observations: result.observations,
    strengths: result.strengths,
    referencePatterns: result.referencePatterns,
    opportunities: result.opportunities,
    risks: result.risks,
    funnelStage: result.funnelStage,
    claimEvidenceQuality: result.claimEvidenceQuality,
    ocrConfidence: result.ocrConfidence,
    scores: result.scores,
  })),
  aplusStatus: entity.aplusStatus || '',
  images: entity.images.map((image) => ({ assetRole: image.assetRole, displayUrl: image.displayUrl, sourceFetchStatus: image.sourceFetchStatus, caption: image.assetRole === 'main' ? '主图' : image.assetRole === 'aplus' ? 'A+ 图' : '商品图' })),
  sellingPoints: entity.sellingPoints,
  opportunities: entity.opportunities,
  risks: entity.risks,
  keywords: entity.keywords,
  painPoints: entity.painPoints,
  positiveThemes: entity.positiveThemes,
}));
const defaultVisibleAsins = [
  ...normalizedEntities.filter((entity) => entity.itemRole === 'own').map((entity) => entity.asin),
  ...normalizedEntities.filter((entity) => entity.itemRole !== 'own').sort((a, b) => (scoreValue(b) ?? -1) - (scoreValue(a) ?? -1)).slice(0, 3).map((entity) => entity.asin),
];
const reportDataV2 = {
  schemaVersion: 'amazon-competitor-html-report-data-v2',
  runId: config.runId,
  ownAsin: config.ownAsin,
  generatedAt,
  title: reportTitle,
  marketplace: ri.marketplace || 'amazon.co.jp',
  products: productData,
  decisionSummary: { headline: decisionHeadline, signals: decisionSignals, dataQuality: dataQualitySummary },
  opportunityItems: ownOpportunityItems,
  riskItems: ownRiskItems,
  actionItems,
  visibleActionItemCount,
  titleKeywordAnalysis: {
    titleRows,
    titleOpportunityTerms,
    keywordOpportunityTerms,
    ownKeywordTerms,
    competitorKeywordHotTerms,
  },
  defaultVisibleAsins,
  categoryScoringModel: scoringModel,
  dataQuality: ri.dataQuality || source.dataQuality || null,
  dataQualitySummary,
  imageAplusStrategy: imageStrategy,
  marketSynthesis,
};
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const v2ProductCards = normalizedEntities.map((entity) => `
      <article class="product-card ${entity.itemRole === 'own' ? 'own' : ''}" id="product-${escapeHtml(anchorSafe(entity.asin))}" data-asin="${escapeHtml(entity.asin)}">
        <div class="product-image-wrap">${entity.mainImageUrl ? `<img class="product-image" loading="lazy" src="${escapeHtml(entity.mainImageUrl)}" alt="${escapeHtml(entity.asin)} main image">` : '<div class="empty">主图未返回</div>'}<span class="role-badge">${entity.itemRole === 'own' ? '我方 Listing' : '竞品'}</span></div>
        <div class="product-body"><div class="product-asin">${escapeHtml(entity.asin)} · ${escapeHtml(entity.brand)}</div><div class="product-title">${escapeHtml(entity.title)}</div>
          <div class="metric-row"><div class="metric"><small>价格</small><strong>${escapeHtml(entity.price)}</strong></div><div class="metric"><small>评分 / 评论</small><strong>${escapeHtml(entity.rating)} / ${escapeHtml(entity.reviewCount)}</strong></div><div class="metric"><small>综合评分</small><strong>${escapeHtml(scoreLabel(entity))}</strong></div><div class="metric"><small>素材</small><strong>${entity.imageCount} 图 · A+ ${entity.aplusCount || '待确认'}</strong></div></div>
          <div class="asset-tags">${tagsHtml(entity)}</div>${entity.url ? `<p><a href="${escapeHtml(entity.url)}" target="_blank" rel="noopener">查看 Amazon Listing →</a></p>` : ''}
        </div>
      </article>`).join('');
const v2ComparisonRows = normalizedEntities.map((entity) => `<tr data-asin="${escapeHtml(entity.asin)}" data-price="${entity.priceNumeric ?? ''}" data-rating="${entity.ratingNumeric ?? ''}" data-reviewcountnumeric="${entity.reviewCountNumeric ?? ''}" data-score="${scoreValue(entity) ?? ''}"><td><strong>${entity.itemRole === 'own' ? '我方' : '竞品'}</strong><br>${escapeHtml(entity.asin)}</td><td>${escapeHtml(entity.brand)}</td><td>${escapeHtml(entity.price)}</td><td>${escapeHtml(entity.rating)}</td><td>${escapeHtml(entity.reviewCount)}</td><td>${escapeHtml(scoreLabel(entity))}</td><td>${entity.imageCount}</td><td>${escapeHtml(statusLabel(entity.aplusStatus, entity.aplusCount, 'A+').label)}</td></tr>`).join('');
const titleAnalysisRowsHtml = titleRows.map((row) => `<tr data-asin="${escapeHtml(row.asin)}"><td><strong>${row.itemRole === 'own' ? '我方' : '竞品'}</strong><br>${escapeHtml(row.asin)}</td><td><span class="title-length ${row.length > 75 ? 'is-risk' : row.length >= 55 ? 'is-warn' : ''}">${row.length} 字符</span><br><small>${escapeHtml(row.status)}</small></td><td>${escapeHtml(row.title)}</td></tr>`).join('');
const titleKeywordSection = `<section class="section listing-text-section" id="listing-text"><div class="section-head"><div><h2>${icon('filter', '标题与关键词诊断')}</h2><p class="section-note">基于我方 ASIN 与竞品 ASIN 的标题结构、关键词覆盖和可借鉴表达，作为图片/A+素材策略的前置诊断。</p></div></div><div class="listing-text-grid"><article class="text-analysis-card"><div class="text-analysis-head"><div><span class="eyebrow">Title Structure</span><h3>标题分析与改写建议</h3></div><span class="analysis-pill">日本站建议 ≤ 75 字符</span></div><div class="text-stat-row"><span>我方 ${ownTitleRow ? `${ownTitleRow.length} 字符` : '标题待确认'}</span><span>竞品均值 ${averageCompetitorTitleLength ?? '待确认'} 字符</span><span>超长 ${titleRows.filter((row) => row.length > 75).length} 个</span></div>${chipListHtml(titleOpportunityTerms, '暂无明显竞品高频标题词')}<div class="text-advice-list">${titleAdvice.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div><details class="text-analysis-details"><summary>查看标题长度与原文</summary><div class="table-wrap compact-table"><table><thead><tr><th>角色 / ASIN</th><th>长度</th><th>标题</th></tr></thead><tbody>${titleAnalysisRowsHtml}</tbody></table></div></details></article><article class="text-analysis-card"><div class="text-analysis-head"><div><span class="eyebrow">Keyword Coverage</span><h3>关键词覆盖与补强建议</h3></div><span class="analysis-pill">标题 / 五点 / 后台分层使用</span></div><div class="keyword-cluster-grid"><div><h4>我方已覆盖</h4>${chipListHtml(ownKeywordTerms.slice(0, 12), '我方关键词待补充')}</div><div><h4>竞品共现词</h4>${chipListHtml(competitorKeywordHotTerms.slice(0, 12).map((item) => `${item.term}${item.count > 1 ? ` ×${item.count}` : ''}`), '暂无竞品共现词')}</div><div><h4>优先补强</h4>${chipListHtml(keywordOpportunityTerms, '暂无明显缺口词')}</div></div><div class="text-advice-list">${keywordAdvice.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div></article></div></section>`;
const scoreDimensions = Array.isArray(scoringModel?.dimensions) ? scoringModel.dimensions : [];
const scoreDimensionMatrix = scoreDimensions.length ? `<div class="score-matrix"><div class="score-matrix-head"><div><span class="eyebrow">Score Evidence</span><h3>综合评分维度热力图</h3></div><span class="analysis-pill">${escapeHtml(scoringModel.category || '当前品类')} · ${escapeHtml(scoringModel.modelVersion || 'run-rubric-v1')}</span></div><div class="table-wrap"><table><thead><tr><th>角色 / ASIN</th>${scoreDimensions.map((dimension) => `<th title="${escapeHtml(dimension.reason || '')}">${escapeHtml(dimension.label || dimension.key)}<br><small>${escapeHtml(dimension.weight)}%</small></th>`).join('')}<th>覆盖率</th></tr></thead><tbody>${normalizedEntities.map((entity) => { const dimensions = new Map((Array.isArray(entity.scorecard?.dimensions) ? entity.scorecard.dimensions : []).map((dimension) => [dimension.key, dimension])); return `<tr data-asin="${escapeHtml(entity.asin)}"><td><strong>${entity.itemRole === 'own' ? '我方' : '竞品'}</strong><br>${escapeHtml(entity.asin)}</td>${scoreDimensions.map((definition) => { const dimension = dimensions.get(definition.key); const value = numericValue(dimension?.score); return `<td class="score-heat-cell" style="--score:${value ?? 0}" title="${escapeHtml(uniqueText(dimension?.evidenceRefs, dimension?.evidence).join(' · ') || '证据待确认')}">${value === null ? '-' : Math.round(value)}</td>`; }).join('')}<td>${Math.round(Number(entity.scorecard?.coverage || 0) * 100)}%</td></tr>`; }).join('')}</tbody></table></div><p class="section-note score-matrix-note">单元格悬停可查看证据路径；缺失维度保持为空，不按 0 分计入。</p></div>` : '';
const imageSequence = uniqueText(imageStrategy.recommendedSequence).slice(0, 8);
const imageBorrowablePatterns = uniqueText(imageStrategy.borrowablePatterns, imageStrategy.competitorPatterns).slice(0, 8);
const imageOwnPriorities = uniqueText(imageStrategy.ownPriorities).slice(0, 8);
const imageComplianceNotes = uniqueText(imageStrategy.complianceNotes).slice(0, 6);
const imageBlueprintSection = imageSequence.length || imageBorrowablePatterns.length ? `<section class="section image-blueprint-section" id="image-blueprint"><div class="section-head"><div><h2>${icon('image', '我方图片 / A+ 改版蓝图')}</h2><p class="section-note">把竞品的可借鉴模式转化为我方素材位计划，同时保留合规与证据边界。</p></div></div><div class="blueprint-grid">${imageSequence.map((item, index) => { const parts = clean(item).split(/[:：]/); const title = parts.shift() || `素材位 ${index + 1}`; const description = parts.join('：') || item; return `<article class="blueprint-card"><span class="blueprint-index">${String(index + 1).padStart(2, '0')}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${imageBorrowablePatterns[index] ? `<small>借鉴模式：${escapeHtml(imageBorrowablePatterns[index])}</small>` : ''}</div></article>`; }).join('')}</div><div class="blueprint-notes"><div><h3>我方优先修改</h3>${listHtml(imageOwnPriorities, '待批次综合分析补充')}</div><div><h3>证据与合规边界</h3>${listHtml(imageComplianceNotes, '暂无额外提示')}</div></div></section>` : '';
const v2Gallery = normalizedEntities.map((entity) => {
  const isOwn = entity.itemRole === 'own';
  const figures = entity.images.map((image) => `<figure><img loading="lazy" src="${escapeHtml(image.displayUrl)}" alt="${escapeHtml(entity.asin + ' ' + image.assetRole)}"><figcaption><span class="asset-role">${escapeHtml(image.assetRole === 'aplus' ? 'A+ 图' : image.assetRole === 'main' ? '主图' : '商品图')}</span><span>${image.sourceFetchStatus === 'placeholder' ? '占位图' : 'MinIO 已缓存'}</span></figcaption></figure>`).join('');
  const visualSummary = isOwn
    ? `<div class="visual-summary visual-summary-own"><div class="visual-summary-head"><div><span class="eyebrow">我方素材诊断</span><strong>${entity.visualAnalyzedImageCount || entity.visualEvidence.length ? `已分析 ${entity.visualAnalyzedImageCount || entity.visualEvidence.length} 张` : '未返回逐图分析'}</strong></div><span class="tag ${entity.visualFailedImageCount ? 'warn' : 'good'}">缓存命中 ${entity.visualCacheHitCount || 0} · 失败 ${entity.visualFailedImageCount || 0}</span></div><div class="visual-summary-grid"><div><h4>核心观察</h4>${listHtml(entity.visualObservations, '暂无可验证的视觉观察')}</div><div><h4>改版建议</h4>${listHtml(entity.visualOpportunities, '暂无结构化视觉建议')}</div><div><h4>风险 / 待补证据</h4>${listHtml(entity.visualRisks, '暂无结构化视觉风险')}</div></div></div>`
    : `<div class="visual-summary visual-summary-reference"><div class="visual-summary-head"><div><span class="eyebrow">竞品素材参考</span><strong>${entity.visualAnalyzedImageCount || entity.visualEvidence.length ? `已提炼 ${entity.visualAnalyzedImageCount || entity.visualEvidence.length} 张素材` : '未返回逐图分析'}</strong></div><span class="tag good">用于借鉴，不作缺陷判定</span></div><p class="reference-note">从竞品中提炼可迁移的构图、信息组织和卖点表达方式，供我方 Listing 改版参考。</p><div class="visual-summary-grid visual-summary-grid-reference"><div><h4>值得借鉴的亮点</h4>${listHtml(entity.visualStrengths.length ? entity.visualStrengths : entity.visualObservations, '暂无可验证的视觉亮点')}</div><div><h4>可迁移的表达方式</h4>${listHtml(entity.visualOpportunities, '暂无结构化借鉴方向')}</div></div></div>`;
  const evidenceDetails = entity.visualEvidence.length ? `<details class="evidence visual-evidence-details" data-visual-asin="${escapeHtml(entity.asin)}"><summary>展开逐图视觉分析与评分 <span class="lazy-count">· ${entity.visualEvidence.length} 张</span></summary><div class="visual-evidence-grid" data-visual-evidence-grid><div class="empty compact">展开后加载逐图证据</div></div></details>` : '';
  return `<div class="gallery-group" id="asin-${escapeHtml(anchorSafe(entity.asin))}" data-asin="${escapeHtml(entity.asin)}"><h3 class="gallery-title"><span class="tag ${isOwn ? 'brand' : ''}">${isOwn ? '我方' : '竞品'}</span>${escapeHtml(entity.asin)} · 商品图 / A+ 图</h3>${figures ? `<div class="gallery gallery-scroll" tabindex="0" aria-label="${escapeHtml(entity.asin)} 商品图和 A+ 图">${figures}</div>` : '<div class="empty">数据源未返回可缓存图片</div>'}${visualSummary}${evidenceDetails}</div>`;
}).join('');
const v2Html = isV2 ? `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Amazon 竞品分析可视化报告 ${escapeHtml(config.ownAsin)}"><title>${escapeHtml(reportTitle)}</title><link rel="stylesheet" href="${escapeHtml(cssHref)}"></head>
<body><main class="shell"><header class="hero" id="top"><div class="hero-layout"><div class="hero-copy"><p class="hero-kicker">Amazon Competitor Intelligence · ${escapeHtml(ri.marketplace || 'amazon.co.jp')}</p><h1 class="hero-title"><span class="hero-title-asin">${escapeHtml(heroAsin)}</span><span class="hero-title-separator"> - </span><span class="hero-title-label">Amazon 竞品分析报告</span></h1><p class="hero-subtitle">面向管理层、运营和内容团队的品类竞争决策看板：先看结论，再下钻证据。</p><div class="hero-meta"><span>Run ${escapeHtml(config.runId)}</span><span>生成 ${escapeHtml(generatedAt)}</span>${wikiUrl ? `<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener">Wiki 版本</a>` : ''}</div></div>${heroOwnImageHtml}</div></header>
<nav class="quick-nav" aria-label="报告导航"><a href="#overview">总览</a><a href="#market">竞争格局</a><a href="#products">商品卡片</a><a href="#matrix">指标表</a><a href="#listing-text">标题关键词</a><a href="#image-blueprint">素材蓝图</a><a href="#gallery">视觉证据</a><a href="#insights">机会与风险</a><a href="#full-report">完整报告</a></nav>
<section class="section" id="overview"><div class="section-head"><div><h2>${icon('chart', '经营决策总览')}</h2><p class="section-note">先看竞争位置、我方 Top 3 机会与风险，再下钻到 Listing、图片和完整证据。</p></div><span class="section-note" data-filtered-count></span></div><div class="decision-meta-strip">${decisionMetaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div><div class="decision-band"><div class="decision-card decision-verdict"><span class="eyebrow">管理层结论</span><h3>${escapeHtml(decisionHeadline)}</h3><p>该结论基于当前可验证的价格、评分、评论、素材和我方 Listing 机会/风险数据；待确认字段不会静默当作 0 分。</p><div class="decision-signal-list">${decisionSignals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join('')}</div></div><div class="decision-card decision-quality" id="data-quality"><span class="eyebrow">数据质量</span><h3>数据覆盖 ${dataQualitySummary.coveragePercent}%</h3><div class="quality-meter" aria-label="数据覆盖 ${dataQualitySummary.coveragePercent}%"><span style="width:${dataQualitySummary.coveragePercent}%"></span></div><p>ASIN ${dataQualitySummary.itemCoverage}% · 评分 ${dataQualitySummary.scoreCoverage}% · 视觉 ${dataQualitySummary.visualCoverage}% · A+/视频状态 ${dataQualitySummary.assetCoverage}%。</p><p class="quality-status">批次综合：${escapeHtml(dataQualitySummary.synthesisStatus)}</p><a class="decision-insight-link" href="#full-report">查看数据限制与失败原因 →</a></div></div><div class="decision-insights-grid">${insightCardHtml('decision-opportunities', '我方 Top 3 机会点', ownOpportunityItems, 'opportunity', '我方 Listing 暂未返回结构化机会点')}${insightCardHtml('decision-risks', '我方 Top 3 风险点', ownRiskItems, 'risk', '我方 Listing 暂未返回结构化风险点')}</div><div class="decision-actions"><div class="decision-actions-head"><div><span class="eyebrow">执行优先级</span><h3>我方 P0 / P1 / P2 行动计划</h3></div><span class="decision-count">共 ${visibleActionItemCount} 项</span></div><div class="decision-action-grid">${actionPriorities.map((priority) => `<div class="decision-action-column"><h4><span class="priority-badge priority-${priority === '待确认' ? 'unknown' : priority.toLowerCase()}">${priority}</span>${actionPriorityLabels[priority]}</h4>${visibleActionItemsByPriority[priority].map((item) => `<div class="decision-action-item"><strong>${escapeHtml(item.action || item.text)}</strong><span>${escapeHtml(item.owner ? `负责 ${item.owner}` : item.source)}${item.successMetric ? ` · 验收 ${escapeHtml(item.successMetric)}` : ''}</span></div>`).join('') || '<div class="empty">暂无</div>'}</div>`).join('')}</div></div></section>
<section class="section" id="market"><div class="section-head"><div><h2>${icon('filter', '竞争格局与评分')}</h2><p class="section-note">悬停气泡查看价格、评分、评论数和综合评分；点击筛选器即可对比不同组合。</p></div></div><div id="competitor-selector" class="selector-bar"></div><div class="chart-grid"><div class="chart-card"><div class="chart-card-head"><h3>价格 × 评分 × 评论量</h3><span>气泡越大，评论量越高</span></div><div id="market-chart" class="chart"></div></div><div class="chart-card"><div class="chart-card-head"><h3>品类自适应综合评分</h3><span>同一批次使用同一模型</span></div><div id="score-chart" class="chart"></div></div></div>${scoreDimensionMatrix}</section>
<section class="section" id="products"><div class="section-head"><div><h2>我方与竞品 Listing 卡片</h2><p class="section-note">点击主图可放大；竞品卡片会跟随上方筛选器显示/隐藏。</p></div></div><div class="product-grid">${v2ProductCards || '<div class="empty">没有可展示的 Listing 结果</div>'}</div></section>
<section class="section" id="matrix"><div class="section-head"><div><h2>核心指标横向对比</h2><p class="section-note">点击价格、评分、评论数或综合评分表头进行排序。</p></div></div><div class="table-wrap"><table id="comparison-table"><thead><tr><th>角色 / ASIN</th><th>品牌</th><th data-sort-key="price">价格</th><th data-sort-key="rating">评分</th><th data-sort-key="reviewcountnumeric">评论数</th><th data-sort-key="score">综合评分</th><th>图片数</th><th>A+</th></tr></thead><tbody>${v2ComparisonRows}</tbody></table></div></section>
${titleKeywordSection}
${imageBlueprintSection}
<section class="section" id="gallery"><div class="section-head"><div><h2>${icon('image', '图片与 A+ 证据墙')}</h2><p class="section-note">商品图与 A+ 图统一缓存到 MinIO，失败会显示占位并保留失败原因。</p></div></div>${v2Gallery}</section>
<section class="section" id="insights"><div class="section-head"><div><h2>机会、风险与关键词</h2><p class="section-note">核心结论直接展开，详细证据在下方完整报告中按需查看。</p></div></div><div class="insight-grid"><div class="insight-card"><h3>差异化机会</h3>${listHtml(allOpportunities, '暂未返回结构化机会点')}</div><div class="insight-card"><h3>风险与约束</h3>${listHtml(allRisks, '暂未返回结构化风险点')}</div><div class="insight-card" id="review-insights"><h3>Review / Q&A 痛点</h3>${listHtml(allPainPoints, '暂未返回可验证痛点')}</div></div><div class="asset-tags" style="margin-top:16px">${allKeywords.map((keyword) => `<span class="tag brand">${escapeHtml(keyword)}</span>`).join('') || '<span class="tag warn">关键词待补充</span>'}</div></section>
<section class="section" id="full-report"><div class="section-head"><div><h2>完整专业分析报告</h2><p class="section-note">Wiki 同源正文在展开时加载，避免与上方决策模块同时占用页面资源。</p></div><a href="#top">返回顶部 ↑</a></div><details class="full-report-details" data-full-report><summary>展开完整正文与证据</summary><article class="markdown-body" data-full-report-body><div class="empty compact">展开后加载 Wiki 同源正文</div></article></details><template id="full-report-template">${markdownHtml || '<div class="empty">最终报告正文未返回</div>'}</template></section>
<footer class="footer"><span class="status-dot"></span> 报告由 Amazon competitor analysis v4.0 market-synthesis renderer 生成。Run ID: ${escapeHtml(config.runId)}。</footer></main><script id="report-data" type="application/json">${safeJson(reportDataV2)}</script><script src="${escapeHtml(config.jsUrl)}" defer></script></body></html>` : legacyHtml;
const html = v2Html;

const fnv1a = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const reportData = isV2 ? {
  ...reportDataV2,
  reportInput: ri,
  reportQa: source.reportQa || null,
  reportVersion: source.reportVersion || '',
  imageRecords,
} : {
  schemaVersion: 'amazon-competitor-html-report-data-v1',
  runId: config.runId,
  ownAsin: config.ownAsin,
  generatedAt,
  title: reportTitle,
  reportInput: ri,
  reportQa: source.reportQa || null,
  reportVersion: source.reportVersion || '',
  imageRecords,
};
const manifest = {
  schemaVersion: 'amazon-competitor-html-manifest-v1',
  runId: config.runId,
  ownAsin: config.ownAsin,
  generatedAt,
  bucket: config.bucket,
  latestHtmlKey: config.latestHtmlKey,
  archiveHtmlKey: config.archiveHtmlKey,
  cssKey: config.cssKey,
  reportDataKey: config.reportDataKey,
  imageCount: imageRecords.length,
  successfulImageUploads: successfulImages,
  placeholderImageCount: placeholderImages,
  failedImages: imageRecords.filter((item) => item.uploadStatus !== 'success' || item.sourceFetchStatus === 'placeholder').map((item) => ({ asin: item.asin, assetRole: item.assetRole, sourceUrl: item.sourceUrl, s3Key: item.s3Key, sourceFetchStatus: item.sourceFetchStatus, uploadStatus: item.uploadStatus, error: item.error })),
  htmlHash: fnv1a(html),
  cssHash: fnv1a(REPORT_CSS),
  reportDataHash: fnv1a(JSON.stringify(reportData)),
};
const jsContent = isV2 && typeof REPORT_JS !== 'undefined' ? REPORT_JS : '';
const iconContent = isV2 && typeof REPORT_ICONS !== 'undefined' ? REPORT_ICONS : '';
const fontContents = isV2 && typeof REPORT_FONTS !== 'undefined' ? REPORT_FONTS : [];
const artifacts = [
  { artifactType: 'css', s3Key: config.cssKey, contentType: 'text/css; charset=utf-8', content: REPORT_CSS },
  ...(isV2 && config.jsKey && jsContent ? [{ artifactType: 'javascript', s3Key: config.jsKey, contentType: 'application/javascript; charset=utf-8', content: jsContent }] : []),
  ...(isV2 && config.iconKey && iconContent ? [{ artifactType: 'icons', s3Key: config.iconKey, contentType: 'image/svg+xml; charset=utf-8', content: iconContent }] : []),
  ...(isV2 && Array.isArray(config.fontKeys) ? config.fontKeys.map((s3Key, index) => ({ artifactType: 'font', s3Key, contentType: 'font/woff2', content: fontContents[index] || '', encoding: 'base64' })).filter((artifact) => artifact.content) : []),
  { artifactType: 'html_archive', s3Key: config.archiveHtmlKey, contentType: 'text/html; charset=utf-8', content: html },
  { artifactType: 'html_latest', s3Key: config.latestHtmlKey, contentType: 'text/html; charset=utf-8', content: html },
  { artifactType: 'report_data', s3Key: config.reportDataKey, contentType: 'application/json; charset=utf-8', content: JSON.stringify(reportData, null, 2) },
  { artifactType: 'manifest', s3Key: config.manifestKey, contentType: 'application/json; charset=utf-8', content: JSON.stringify(manifest, null, 2) },
];

return artifacts.map((artifact, index) => ({
  json: {
    ...artifact,
    config,
    publicUrl: `${config.publicBaseUrl}/${artifact.s3Key}`,
    hash: fnv1a(artifact.content),
  },
  binary: {
    data: {
      data: (artifact.encoding === 'base64' ? Buffer.from(artifact.content, 'base64') : Buffer.from(artifact.content, 'utf8')).toString('base64'),
      mimeType: artifact.contentType,
      fileName: artifact.s3Key.split('/').pop(),
    },
  },
  pairedItem: { item: index },
}));
