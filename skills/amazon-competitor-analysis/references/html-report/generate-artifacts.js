const source = $('When called by orchestrator').first().json || {};
const ri = source.reportInput && typeof source.reportInput === 'object' ? source.reportInput : {};
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
    for (const key of ['text', 'title', 'theme', 'keyword', 'value', 'point', 'summary', 'message', 'label']) {
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
    return {
      ...result,
      index: Number(result.position ?? index),
      displayUrl: cached?.displayUrl || sourceUrl,
      role: clean(result.role || result.imageType || 'image'),
      coreMessage: clean(result.coreMessage || result.useCase || ''),
      observations: uniqueText(result.visibleObjects, result.visibleClaims, result.evidence).slice(0, 8),
      strengths: uniqueText(result.conversionStrengths).slice(0, 5),
      opportunities: uniqueText(result.opportunities).slice(0, 5),
      risks: uniqueText(result.risks, result.complianceRisks).slice(0, 5),
      scores: result.scores || {},
    };
  });
  const visualObservations = uniqueText(imageAplus.observations, visualEvidence.map((result) => result.coreMessage)).slice(0, 6);
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
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<img loading="lazy" src="$2" alt="$1">');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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

const allOpportunities = uniqueText(...normalizedEntities.map((entity) => entity.opportunities)).slice(0, 10);
const allRisks = uniqueText(...normalizedEntities.map((entity) => entity.risks)).slice(0, 10);
const allKeywords = uniqueText(...normalizedEntities.map((entity) => entity.keywords)).slice(0, 24);
const allPainPoints = uniqueText(...normalizedEntities.map((entity) => entity.painPoints)).slice(0, 10);
const listHtml = (values, emptyText) => values.length ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : `<div class="empty">${escapeHtml(emptyText)}</div>`;
let markdown = clean(source.markdown || source.report || '');
for (const [sourceUrl, cachedUrl] of imageBySource.entries()) markdown = markdown.split(sourceUrl).join(cachedUrl);
const markdownHtml = renderMarkdown(markdown);
const generatedAt = clean(ri.generatedAt || source.generatedAt) || new Date().toISOString();
const wikiPath = clean(source.wikiPath || ri.finalWikiPath);
const wikiUrl = clean(source.wikiLink) || (wikiPath ? `https://wiki.dinve.com/zh/${wikiPath.replace(/^\/+/, '')}` : '');
const successfulImages = imageRecords.filter((item) => item.uploadStatus === 'success').length;
const placeholderImages = imageRecords.filter((item) => item.sourceFetchStatus === 'placeholder').length;
const reportTitle = clean(source.title) || `Amazon 竞品分析报告 - ${config.ownAsin}`;

const legacyHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Amazon 竞品分析可视化报告 ${escapeHtml(config.ownAsin)}">
  <title>${escapeHtml(reportTitle)}</title>
  <link rel="stylesheet" href="${escapeHtml(config.cssUrl)}">
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
const scoreValue = (entity) => entity.score === null || entity.score === undefined ? null : Math.max(0, Math.min(100, Number(entity.score)));
const scoreLabel = (entity) => scoreValue(entity) === null ? '待评分' : `${Math.round(scoreValue(entity))}`;
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
  visualOpportunities: entity.visualOpportunities || [],
  visualRisks: entity.visualRisks || [],
  visualEvidence: (entity.visualEvidence || []).map((result) => ({
    displayUrl: result.displayUrl,
    role: result.role,
    index: result.index,
    coreMessage: result.coreMessage,
    observations: result.observations,
    strengths: result.strengths,
    opportunities: result.opportunities,
    risks: result.risks,
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
  defaultVisibleAsins,
  categoryScoringModel: ri.categoryScoringModel || source.categoryScoringModel || null,
  dataQuality: ri.dataQuality || source.dataQuality || null,
};
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const v2ProductCards = normalizedEntities.map((entity) => `
      <article class="product-card ${entity.itemRole === 'own' ? 'own' : ''}" data-asin="${escapeHtml(entity.asin)}">
        <div class="product-image-wrap">${entity.mainImageUrl ? `<img class="product-image" loading="lazy" src="${escapeHtml(entity.mainImageUrl)}" alt="${escapeHtml(entity.asin)} main image">` : '<div class="empty">主图未返回</div>'}<span class="role-badge">${entity.itemRole === 'own' ? '我方 Listing' : '竞品'}</span></div>
        <div class="product-body"><div class="product-asin">${escapeHtml(entity.asin)} · ${escapeHtml(entity.brand)}</div><div class="product-title">${escapeHtml(entity.title)}</div>
          <div class="metric-row"><div class="metric"><small>价格</small><strong>${escapeHtml(entity.price)}</strong></div><div class="metric"><small>评分 / 评论</small><strong>${escapeHtml(entity.rating)} / ${escapeHtml(entity.reviewCount)}</strong></div><div class="metric"><small>综合评分</small><strong>${escapeHtml(scoreLabel(entity))}</strong></div><div class="metric"><small>素材</small><strong>${entity.imageCount} 图 · A+ ${entity.aplusCount || '待确认'}</strong></div></div>
          <div class="asset-tags">${tagsHtml(entity)}</div>${entity.url ? `<p><a href="${escapeHtml(entity.url)}" target="_blank" rel="noopener">查看 Amazon Listing →</a></p>` : ''}
        </div>
      </article>`).join('');
const v2ComparisonRows = normalizedEntities.map((entity) => `<tr data-asin="${escapeHtml(entity.asin)}" data-price="${entity.priceNumeric ?? ''}" data-rating="${entity.ratingNumeric ?? ''}" data-reviewcountnumeric="${entity.reviewCountNumeric ?? ''}" data-score="${scoreValue(entity) ?? ''}"><td><strong>${entity.itemRole === 'own' ? '我方' : '竞品'}</strong><br>${escapeHtml(entity.asin)}</td><td>${escapeHtml(entity.brand)}</td><td>${escapeHtml(entity.price)}</td><td>${escapeHtml(entity.rating)}</td><td>${escapeHtml(entity.reviewCount)}</td><td>${escapeHtml(scoreLabel(entity))}</td><td>${entity.imageCount}</td><td>${escapeHtml(statusLabel(entity.aplusStatus, entity.aplusCount, 'A+').label)}</td></tr>`).join('');
const v2Gallery = normalizedEntities.map((entity) => {
  const figures = entity.images.map((image) => `<figure><img loading="lazy" src="${escapeHtml(image.displayUrl)}" alt="${escapeHtml(entity.asin + ' ' + image.assetRole)}"><figcaption>${escapeHtml(image.assetRole)} · ${image.sourceFetchStatus === 'placeholder' ? '占位图' : 'MinIO 已缓存'}</figcaption></figure>`).join('');
  const visualSummary = `<div class="visual-summary"><div class="visual-summary-head"><div><span class="eyebrow">视觉分析</span><strong>${entity.visualAnalyzedImageCount || entity.visualEvidence.length ? `已分析 ${entity.visualAnalyzedImageCount || entity.visualEvidence.length} 张` : '未返回逐图分析'}</strong></div><span class="tag ${entity.visualFailedImageCount ? 'warn' : 'good'}">缓存命中 ${entity.visualCacheHitCount || 0} · 失败 ${entity.visualFailedImageCount || 0}</span></div><div class="visual-summary-grid"><div><h4>核心观察</h4>${listHtml(entity.visualObservations, '暂无可验证的视觉观察')}</div><div><h4>转化建议</h4>${listHtml(entity.visualOpportunities, '暂无结构化视觉建议')}</div><div><h4>风险 / 待补证据</h4>${listHtml(entity.visualRisks, '暂无结构化视觉风险')}</div></div>${entity.visualEvidence.length ? `<details class="evidence"><summary>展开逐图视觉分析与评分</summary><div class="visual-evidence-grid">${entity.visualEvidence.map((result) => `<article class="visual-evidence-card">${result.displayUrl ? `<img loading="lazy" src="${escapeHtml(result.displayUrl)}" alt="${escapeHtml(entity.asin)} ${escapeHtml(result.role)} ${Number(result.index) + 1}">` : ''}<div class="visual-evidence-body"><div class="visual-evidence-meta"><span>${escapeHtml(result.role || 'image')} #${Number(result.index) + 1}</span><span>清晰 ${escapeHtml(result.scores?.clarity ?? '-')} · 转化 ${escapeHtml(result.scores?.conversion ?? '-')}</span></div><strong>${escapeHtml(result.coreMessage || '未返回核心信息')}</strong>${listHtml(result.observations, '未返回可见元素/文案证据')}${listHtml(result.opportunities, '未返回逐图建议')}${listHtml(result.risks, '未返回逐图风险')}</div></article>`).join('')}</div></details>` : ''}</div>`;
  return `<div class="gallery-group" data-asin="${escapeHtml(entity.asin)}"><h3 class="gallery-title"><span class="tag ${entity.itemRole === 'own' ? 'brand' : ''}">${entity.itemRole === 'own' ? '我方' : '竞品'}</span>${escapeHtml(entity.asin)} · 商品图 / A+ 图</h3>${figures ? `<div class="gallery">${figures}</div>` : '<div class="empty">数据源未返回可缓存图片</div>'}${visualSummary}</div>`;
}).join('');
const v2Html = isV2 ? `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Amazon 竞品分析可视化报告 ${escapeHtml(config.ownAsin)}"><title>${escapeHtml(reportTitle)}</title><link rel="stylesheet" href="${escapeHtml(config.cssUrl)}"></head>
<body><main class="shell"><header class="hero" id="top"><p class="hero-kicker">Amazon Competitor Intelligence · ${escapeHtml(ri.marketplace || 'amazon.co.jp')}</p><h1>${escapeHtml(reportTitle)}</h1><p class="hero-subtitle">面向管理层、运营和内容团队的品类竞争决策看板：先看结论，再下钻证据。</p><div class="hero-meta"><span>我方 ASIN ${escapeHtml(config.ownAsin)}</span><span>Run ${escapeHtml(config.runId)}</span><span>生成 ${escapeHtml(generatedAt)}</span>${wikiUrl ? `<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener">Wiki 版本</a>` : ''}</div></header>
<nav class="quick-nav" aria-label="报告导航"><a href="#overview">总览</a><a href="#market">竞争格局</a><a href="#products">商品卡片</a><a href="#matrix">指标表</a><a href="#gallery">视觉证据</a><a href="#insights">机会与风险</a><a href="#full-report">完整报告</a></nav>
<section class="section" id="overview"><div class="section-head"><div><h2>${icon('chart', '经营决策总览')}</h2><p class="section-note">默认展示我方和竞争力最高的 3 个竞品；其余可通过筛选器打开。</p></div><span class="section-note" data-filtered-count></span></div><div class="kpi-grid"><div class="kpi"><div class="kpi-label">竞品数</div><div class="kpi-value">${Number(ri.competitorCount || normalizedEntities.filter((entity) => entity.itemRole !== 'own').length)}</div><div class="kpi-note">成功 ${Number(ri.successCount || 0)} / 失败 ${Number(ri.failedCount || 0)}</div></div><div class="kpi"><div class="kpi-label">已缓存图片</div><div class="kpi-value">${successfulImages}</div><div class="kpi-note">占位图 ${placeholderImages}</div></div><div class="kpi"><div class="kpi-label">机会点</div><div class="kpi-value">${allOpportunities.length}</div><div class="kpi-note">结构化去重</div></div><div class="kpi"><div class="kpi-label">风险点</div><div class="kpi-value">${allRisks.length}</div><div class="kpi-note">经营与合规线索</div></div><div class="kpi"><div class="kpi-label">评分模型</div><div class="kpi-value">${normalizedEntities.filter((entity) => scoreValue(entity) !== null).length}</div><div class="kpi-note">个 ASIN 已评分</div></div></div><div class="decision-band"><div class="decision-card"><span class="eyebrow">管理层结论</span><h3>先判断相对位置，再决定内容和投放资源。</h3><p>气泡图用于识别价格—口碑象限，评分条用于比较统一口径下的竞争力。所有缺失字段保留为“待确认”，不会静默当作 0 分。</p></div><div class="decision-card"><span class="eyebrow">数据质量</span><h3>${escapeHtml(ri.status || '待核验')}</h3><p>抓取失败竞品、视觉分析失败和缓存命中情况继续保存在原始报告与 manifest 中。</p></div></div></section>
<section class="section" id="market"><div class="section-head"><div><h2>${icon('filter', '竞争格局与评分')}</h2><p class="section-note">悬停气泡查看价格、评分、评论数和综合评分；点击筛选器即可对比不同组合。</p></div></div><div id="competitor-selector" class="selector-bar"></div><div class="chart-grid"><div class="chart-card"><div class="chart-card-head"><h3>价格 × 评分 × 评论量</h3><span>气泡越大，评论量越高</span></div><div id="market-chart" class="chart"></div></div><div class="chart-card"><div class="chart-card-head"><h3>品类自适应综合评分</h3><span>同一批次使用同一模型</span></div><div id="score-chart" class="chart"></div></div></div></section>
<section class="section" id="products"><div class="section-head"><div><h2>我方与竞品 Listing 卡片</h2><p class="section-note">点击主图可放大；竞品卡片会跟随上方筛选器显示/隐藏。</p></div></div><div class="product-grid">${v2ProductCards || '<div class="empty">没有可展示的 Listing 结果</div>'}</div></section>
<section class="section" id="matrix"><div class="section-head"><div><h2>核心指标横向对比</h2><p class="section-note">点击价格、评分、评论数或综合评分表头进行排序。</p></div></div><div class="table-wrap"><table id="comparison-table"><thead><tr><th>角色 / ASIN</th><th>品牌</th><th data-sort-key="price">价格</th><th data-sort-key="rating">评分</th><th data-sort-key="reviewcountnumeric">评论数</th><th data-sort-key="score">综合评分</th><th>图片数</th><th>A+</th></tr></thead><tbody>${v2ComparisonRows}</tbody></table></div></section>
<section class="section" id="gallery"><div class="section-head"><div><h2>${icon('image', '图片与 A+ 证据墙')}</h2><p class="section-note">商品图与 A+ 图统一缓存到 MinIO，失败会显示占位并保留失败原因。</p></div></div>${v2Gallery}</section>
<section class="section" id="insights"><div class="section-head"><div><h2>机会、风险与关键词</h2><p class="section-note">核心结论直接展开，详细证据在下方完整报告中按需查看。</p></div></div><div class="insight-grid"><div class="insight-card"><h3>差异化机会</h3>${listHtml(allOpportunities, '暂未返回结构化机会点')}</div><div class="insight-card"><h3>风险与约束</h3>${listHtml(allRisks, '暂未返回结构化风险点')}</div><div class="insight-card"><h3>Review / Q&A 痛点</h3>${listHtml(allPainPoints, '暂未返回可验证痛点')}</div></div><div class="asset-tags" style="margin-top:16px">${allKeywords.map((keyword) => `<span class="tag brand">${escapeHtml(keyword)}</span>`).join('') || '<span class="tag warn">关键词待补充</span>'}</div></section>
<section class="section" id="full-report"><div class="section-head"><div><h2>完整专业分析报告</h2><p class="section-note">详细证据、逐图分析、原始 Review 等内容默认折叠，保留 Wiki 同源正文。</p></div><a href="#top">返回顶部 ↑</a></div><details><summary>展开完整正文与证据</summary><article class="markdown-body">${markdownHtml || '<div class="empty">最终报告正文未返回</div>'}</article></details></section>
<footer class="footer"><span class="status-dot"></span> 报告由 Amazon competitor analysis v3.2 report-v2 renderer 生成。Run ID: ${escapeHtml(config.runId)}。</footer></main><script id="report-data" type="application/json">${safeJson(reportDataV2)}</script><script src="${escapeHtml(config.jsUrl)}" defer></script></body></html>` : legacyHtml;
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
