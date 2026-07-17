const source = $('When called to publish listing audit').first().json || {};
const listing = source.listing && typeof source.listing === 'object' ? source.listing : {};
const audit = source.audit && typeof source.audit === 'object' ? source.audit : {};
const visual = source.visualAnalysis && typeof source.visualAnalysis === 'object' ? source.visualAnalysis : {};
const clean = (value) => String(value ?? '').trim();
const safeSegment = (value, fallback) => clean(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const escapeHtml = (value) => clean(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const safeUrl = (value) => /^https?:\/\//i.test(clean(value)) ? clean(value).replace(/"/g, '%22') : '';
const list = (value) => Array.isArray(value) ? value : [];
const display = (value, fallback = '待确认') => clean(value) || fallback;
const runId = safeSegment(source.runId, `run-${Date.now()}`);
const asin = safeSegment(source.asin || listing.asin, 'unknown');
const bucket = clean(source.s3Bucket) || 'amazon-reports';
const prefix = clean(source.s3Prefix || 'amazon/listing-audits').replace(/^\/+|\/+$/g, '');
const publicBaseUrl = clean(source.publicBaseUrl || `https://data.dinve.com/${bucket}`).replace(/\/+$/, '');
const deliveryBaseUrl = clean(source.deliveryBaseUrl).replace(/\/+$/, '');
const shortBaseUrl = clean(source.shortBaseUrl || 'https://data.dinve.com').replace(/\/+$/, '');
const useShortUrl = source.useShortUrl !== false && Boolean(shortBaseUrl);
const latestBaseKey = `${prefix}/${asin}`;
const archiveBaseKey = `${latestBaseKey}/runs/${runId}`;
const latestHtmlKey = `${latestBaseKey}/index.html`;
const archiveHtmlKey = `${archiveBaseKey}/index.html`;
const reportDataKey = `${archiveBaseKey}/report.json`;
const manifestKey = `${archiveBaseKey}/manifest.json`;
const objectUrl = (key) => `${publicBaseUrl}/${key}`;
const gatewayUrl = (key) => deliveryBaseUrl
  ? `${deliveryBaseUrl}?key=${encodeURIComponent(key)}`
  : objectUrl(key);
const deliveryUrl = (artifactType, key) => {
  if (useShortUrl && artifactType === 'html_latest') return `${shortBaseUrl}/${latestBaseKey}/`;
  if (useShortUrl && artifactType === 'html_archive') return `${shortBaseUrl}/${archiveBaseKey}/`;
  return gatewayUrl(key);
};
const status = clean(source.status) || (visual.status === 'success' ? 'success' : 'partial');
const statusLabel = status === 'success' ? '完整报告' : status === 'partial' ? '部分证据报告' : '生成失败';
const tone = status === 'success' ? 'good' : status === 'partial' ? 'warn' : 'danger';
const imageUrls = [...new Set([
  ...list(listing.images),
  ...list(listing.aplusImages),
].map(safeUrl).filter(Boolean))].slice(0, 14);
const executive = audit.executiveSummary || {};
const diagnosis = audit.listingDiagnosis || {};
const title = diagnosis.title || {};
const bullets = diagnosis.bulletPoints || {};
const description = diagnosis.description || {};
const searchTerms = diagnosis.searchTerms || {};
const visualDiagnosis = audit.visualDiagnosis || {};
const aplus = audit.aplusDiagnosis || {};
const confidence = Number(audit.confidence);
const confidenceText = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '待确认';
const generatedAt = new Date().toISOString();
const generatedLabel = generatedAt.replace('T', ' ').slice(0, 19) + ' UTC';
const mainImage = safeUrl(listing.mainImageUrl || listing.mainImage || imageUrls[0]);
const brand = display(listing.brand, asin);
const productTitle = display(listing.title, asin);
const visualResults = list(visual.results).filter((item) => item && typeof item === 'object').slice(0, 12);
const analyzedImageCount = Number(visual.analyzedImageCount || visualResults.filter((item) => item.status === 'analyzed').length || 0);
const totalImageCount = Number(visual.totalImages || imageUrls.length || 0);
const complianceRisks = list(audit.complianceRisks);
const opportunities = list(audit.conversionOpportunities);
const actionPlan = list(audit.actionPlan);
const topPriorities = list(executive.topPriorities).map(clean).filter(Boolean).slice(0, 3);
const priorityClass = (value) => {
  const priority = clean(value).toUpperCase();
  if (priority === 'P0') return 'p0';
  if (priority === 'P1') return 'p1';
  if (priority === 'P2') return 'p2';
  return 'confirm';
};
const renderList = (items, empty = '暂无') => {
  const values = list(items).map((item) => clean(typeof item === 'object' ? (item.text || item.value || item.task || JSON.stringify(item)) : item)).filter(Boolean);
  return values.length ? `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : `<p class="muted">${escapeHtml(empty)}</p>`;
};
const renderTags = (items, empty = '暂无可展示信息') => {
  const values = list(items).map(clean).filter(Boolean);
  return values.length ? `<div class="tag-list">${values.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : `<p class="muted">${escapeHtml(empty)}</p>`;
};
const renderTable = (headers, rows) => {
  if (!rows.length) return '<p class="muted">暂无数据</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
const evidenceCards = visualResults.length
  ? visualResults.map((item, index) => {
      const imageUrl = safeUrl(item.url || item.normalizedUrl || imageUrls[index]);
      const role = item.role === 'main' ? '主图' : item.role === 'aplus' ? 'A+ 素材' : `商品图 ${Number(item.position ?? index) + 1}`;
      const stage = display(item.funnelStage, '待确认');
      const visibleText = list(item.visibleText);
      const visibleClaims = list(item.visibleClaims);
      const strengths = list(item.conversionStrengths);
      const improvements = list(item.opportunities);
      const risks = [...list(item.complianceRisks), ...list(item.risks)];
      const composition = item.composition && typeof item.composition === 'object'
        ? Object.values(item.composition).map(clean).filter(Boolean).join('；')
        : clean(item.composition);
      return `<article class="evidence-card">
        <div class="evidence-media">${imageUrl ? `<img loading="lazy" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(role)}">` : '<div class="image-unavailable">图片不可用</div>'}<span class="asset-label">${escapeHtml(role)}</span></div>
        <div class="evidence-body"><div class="evidence-head"><span class="stage">${escapeHtml(stage)}</span><span class="status-dot">${escapeHtml(display(item.status, 'unknown'))}</span></div>
          <h3>${escapeHtml(display(item.coreMessage, `${role}视觉证据`))}</h3>
          <p>${escapeHtml(display(item.useCase, '当前结果未返回使用场景说明。'))}</p>
          <details><summary>展开逐图证据</summary>
            <div class="evidence-detail"><strong>OCR / 可见文字</strong>${renderTags([...visibleText, ...visibleClaims], '未识别到可见文字或主张')}</div>
            <div class="evidence-detail"><strong>画面构成</strong><p>${escapeHtml(display(composition, '待确认'))}</p></div>
            <div class="evidence-detail"><strong>转化优势</strong>${renderList(strengths, '当前未返回明确优势')}</div>
            <div class="evidence-detail"><strong>改版机会</strong>${renderList(improvements, '当前未返回明确机会')}</div>
            ${risks.length ? `<div class="evidence-detail risk-detail"><strong>风险提示</strong>${renderList(risks)}</div>` : ''}
          </details>
        </div>
      </article>`;
    }).join('')
  : imageUrls.map((url, index) => `<article class="evidence-card"><div class="evidence-media"><img loading="lazy" src="${escapeHtml(url)}" alt="Amazon 商品素材 ${index + 1}"><span class="asset-label">${index === 0 ? '主图' : `商品图 ${index + 1}`}</span></div><div class="evidence-body"><h3>视觉分析证据待补充</h3><p>已保留原始商品素材，但当前运行没有逐图结构化分析。</p></div></article>`).join('');
const css = `
:root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #172126; background: #f3f5f4; letter-spacing: 0; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: #f3f5f4; line-height: 1.62; }
a { color: #176c5b; }
img { max-width: 100%; }
.shell { width: min(1340px, calc(100% - 36px)); margin: 0 auto; padding: 28px 0 76px; }
.report-head { position: relative; display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(280px, .55fr); min-height: 390px; overflow: hidden; border-radius: 8px; background: #142832; color: #f7faf9; }
.hero-copy { display: flex; flex-direction: column; justify-content: center; padding: 48px 52px; }
.kicker { margin: 0 0 12px; color: #7dd1bd; font-size: 12px; font-weight: 800; text-transform: uppercase; }
h1 { margin: 0; max-width: 820px; font-size: 42px; line-height: 1.18; overflow-wrap: anywhere; }
.product-title { display: -webkit-box; max-width: 900px; margin: 18px 0 0; overflow: hidden; color: #d8e3df; font-size: 16px; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.full-title { margin-top: 10px; }
.full-title summary { color: #9fddce; cursor: pointer; font-size: 12px; font-weight: 700; }
.full-title p { margin: 8px 0 0; color: #d8e3df; font-size: 13px; }
.subtitle { max-width: 820px; margin: 16px 0 0; color: #b8c9c4; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
.badge { display: inline-flex; align-items: center; min-height: 30px; padding: 4px 9px; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; background: rgba(255,255,255,.08); color: #eef5f2; font-size: 12px; font-weight: 700; }
.badge.good { color: #067647; border-color: #a6f4c5; background: #ecfdf3; }
.badge.warn { color: #93370d; border-color: #fedf89; background: #fffaeb; }
.badge.danger { color: #b42318; border-color: #fecdca; background: #fef3f2; }
.hero-product { display: flex; align-items: center; justify-content: center; min-width: 0; padding: 34px; background: #dfe9e5; }
.product-frame { position: relative; width: min(100%, 360px); aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid rgba(20,40,50,.12); border-radius: 8px; background: #fff; }
.product-frame img { width: 100%; height: 100%; object-fit: contain; }
.product-frame span { position: absolute; left: 12px; top: 12px; padding: 5px 8px; border-radius: 5px; background: #142832; color: #fff; font-size: 11px; font-weight: 700; }
.image-unavailable { display: grid; width: 100%; height: 100%; place-items: center; color: #65736f; background: #e8eeeb; }
.quick-nav { position: sticky; top: 8px; z-index: 5; display: flex; gap: 8px; overflow-x: auto; margin: 14px 0 0; padding: 10px 14px; border: 1px solid #d7ddda; border-radius: 8px; background: rgba(255,255,255,.96); box-shadow: 0 8px 22px rgba(23,33,38,.06); }
.quick-nav a { flex: 0 0 auto; padding: 6px 9px; border-radius: 5px; color: #34413d; font-size: 12px; font-weight: 700; text-decoration: none; }
.quick-nav a:hover { background: #e5f1ed; color: #176c5b; }
.section { padding: 54px 0; border-top: 1px solid #d7ddda; }
.section:first-of-type { border-top: 0; }
.section-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.section-head .eyebrow { margin: 0 0 5px; color: #176c5b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.section h2 { margin: 0; font-size: 27px; line-height: 1.25; }
.section-note { max-width: 560px; margin: 0; color: #66736f; font-size: 13px; }
.section h3 { margin: 0 0 10px; font-size: 16px; }
.decision-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, .45fr); gap: 16px; }
.decision-statement { min-height: 250px; padding: 30px; border: 1px solid #cfdad5; border-left: 5px solid #176c5b; border-radius: 8px; background: #f9fbfa; }
.decision-statement small, .quality-panel small { color: #8a641d; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.decision-statement h3 { margin: 14px 0 12px; font-size: 28px; line-height: 1.35; }
.decision-statement p { color: #55625e; }
.quality-panel { padding: 26px; border: 1px solid #d7ddda; border-radius: 8px; background: #fff; }
.quality-panel strong { display: block; margin: 14px 0 8px; color: #315d7a; font-size: 28px; }
.quality-panel p { color: #66736f; font-size: 13px; }
.metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 16px; overflow: hidden; border: 1px solid #d7ddda; border-radius: 8px; background: #fff; }
.metric { min-height: 104px; padding: 16px; border-right: 1px solid #e1e6e3; }
.metric:last-child { border-right: 0; }
.metric small { display: block; color: #71807b; font-size: 11px; }
.metric strong { display: block; margin-top: 8px; font-size: 19px; overflow-wrap: anywhere; }
.priority-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.priority-card { min-height: 150px; padding: 20px; border: 1px solid #d7ddda; border-radius: 8px; background: #fff; }
.priority-card span { display: inline-grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; background: #176c5b; color: #fff; font-size: 12px; font-weight: 800; }
.priority-card p { margin: 15px 0 0; font-weight: 700; }
.evidence-wall { display: grid; grid-auto-columns: minmax(320px, 410px); grid-auto-flow: column; gap: 14px; overflow-x: auto; padding: 2px 2px 16px; scroll-snap-type: x proximity; }
.evidence-card { overflow: hidden; border: 1px solid #d7ddda; border-radius: 8px; background: #fff; scroll-snap-align: start; }
.evidence-media { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: #eef2f0; }
.evidence-media img { width: 100%; height: 100%; object-fit: contain; }
.asset-label { position: absolute; left: 10px; top: 10px; padding: 5px 8px; border-radius: 5px; background: #142832; color: #fff; font-size: 11px; font-weight: 700; }
.evidence-body { padding: 18px; }
.evidence-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stage { color: #176c5b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.status-dot { color: #66736f; font-size: 11px; }
.evidence-body h3 { margin-top: 12px; }
.evidence-body > p { min-height: 52px; color: #66736f; font-size: 13px; }
details summary { cursor: pointer; color: #176c5b; font-size: 12px; font-weight: 700; }
.evidence-detail { padding: 14px 0; border-top: 1px solid #e3e8e5; }
.evidence-detail:first-of-type { margin-top: 12px; }
.evidence-detail strong { font-size: 12px; }
.evidence-detail p, .evidence-detail li { font-size: 12px; }
.risk-detail { color: #8f332b; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag-list span { padding: 4px 7px; border: 1px solid #d7ddda; border-radius: 5px; background: #f7f9f8; font-size: 11px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.diagnostic-block { padding: 24px; border-top: 4px solid #315d7a; background: #fff; }
.diagnostic-block.issue { border-color: #b5473c; }
.copy-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
.copy-panel { min-height: 190px; padding: 22px; border: 1px solid #d7ddda; border-radius: 8px; background: #fff; }
.copy-panel.recommended { border-color: #83bdae; background: #f3faf7; }
.copy-panel small { color: #71807b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.copy-panel p { margin: 12px 0 0; overflow-wrap: anywhere; }
.table-wrap { overflow-x: auto; border: 1px solid #d7ddda; border-radius: 8px; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 12px 13px; border-bottom: 1px solid #e3e8e5; text-align: left; vertical-align: top; }
th { color: #4d5a56; background: #f5f7f6; font-size: 11px; white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
ul { margin: 8px 0; padding-left: 20px; }
li { margin: 5px 0; }
.action-list { display: grid; gap: 10px; }
.action-item { display: grid; grid-template-columns: 60px minmax(0, 1.2fr) minmax(0, 1fr) minmax(180px, .75fr); gap: 16px; align-items: start; padding: 18px 0; border-top: 1px solid #d7ddda; }
.action-item:first-child { border-top: 0; }
.priority { display: inline-flex; width: fit-content; min-width: 40px; justify-content: center; padding: 5px 7px; border-radius: 5px; font-size: 11px; font-weight: 800; }
.priority.p0 { color: #8f332b; background: #fceceb; }
.priority.p1 { color: #875b0e; background: #fff4d8; }
.priority.p2 { color: #315d7a; background: #eaf2f7; }
.priority.confirm { color: #52615c; background: #e9eeeb; }
.action-item strong, .action-item p { margin: 0; }
.action-item p { color: #66736f; font-size: 13px; }
.muted { color: #66736f; }
.footer { margin-top: 18px; padding: 18px 0; border-top: 1px solid #d7ddda; color: #66736f; font-size: 12px; }
@media (max-width: 980px) { .report-head { grid-template-columns: 1fr; } .hero-product { min-height: 320px; } .product-frame { width: min(100%, 320px); } .decision-grid { grid-template-columns: 1fr; } .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); } .metric { border-bottom: 1px solid #e1e6e3; } .priority-grid { grid-template-columns: 1fr; } .two-col, .copy-compare { grid-template-columns: 1fr; } .action-item { grid-template-columns: 54px 1fr; } .action-item p, .action-item > strong:last-child { grid-column: 2; } }
@media (max-width: 600px) { .shell { width: min(100% - 16px, 1340px); padding-top: 8px; } .report-head { min-height: auto; } .hero-copy { padding: 22px 20px 18px; } .kicker { margin-bottom: 8px; font-size: 10px; } h1 { font-size: 28px; line-height: 1.2; } .product-title { margin-top: 12px; font-size: 13px; -webkit-line-clamp: 2; } .full-title { margin-top: 6px; } .subtitle { display: -webkit-box; margin-top: 12px; overflow: hidden; font-size: 13px; -webkit-box-orient: vertical; -webkit-line-clamp: 3; } .meta { margin-top: 16px; } .badge { min-height: 28px; font-size: 11px; } .hero-product { min-height: 205px; padding: 12px; } .product-frame { width: min(100%, 190px); } .section { padding: 38px 0; } .section-head { display: block; } .section-note { margin-top: 8px; } .section h2 { font-size: 23px; } .decision-statement { min-height: 0; padding: 22px; } .decision-statement h3 { font-size: 22px; } .quality-panel { padding: 20px; } .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .metric { min-height: 92px; } .evidence-wall { grid-auto-columns: minmax(285px, 86vw); } .copy-panel { min-height: 0; } .action-item { gap: 10px; } }
@media print { body { background: #fff; } .shell { width: 100%; padding: 0; } .quick-nav { display: none; } .section { break-inside: avoid; } }
`;
const html = `<!doctype html>
<html lang="${escapeHtml(source.reportLanguage || 'zh-CN')}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(productTitle)} - Amazon Listing Audit</title><style>${css}</style></head>
<body><main class="shell">
  <header class="report-head">
    <div class="hero-copy"><p class="kicker">Amazon Listing Intelligence · ${escapeHtml(display(source.marketplace || listing.marketplace))}</p>
      <h1>${escapeHtml(brand)} Listing 优化审计</h1>
      <p class="product-title">${escapeHtml(productTitle)}</p>
      <details class="full-title"><summary>查看完整商品标题</summary><p>${escapeHtml(productTitle)}</p></details>
      <p class="subtitle">${escapeHtml(display(executive.positioning, '从商品事实、视觉证据和转化路径出发，给出可执行的 Listing 优化优先级。'))}</p>
      <div class="meta"><span class="badge ${tone}">${escapeHtml(statusLabel)}</span><span class="badge">ASIN ${escapeHtml(asin)}</span><span class="badge">Run ${escapeHtml(runId)}</span><span class="badge">${escapeHtml(generatedLabel)}</span></div>
    </div>
    <div class="hero-product">${mainImage ? `<div class="product-frame"><img src="${escapeHtml(mainImage)}" alt="${escapeHtml(brand)} 商品主图"><span>Listing 主图</span></div>` : '<div class="product-frame"><div class="image-unavailable">抓取源未返回主图</div></div>'}</div>
  </header>
  <nav class="quick-nav"><a href="#overview">决策总览</a><a href="#visual">视觉证据</a><a href="#listing">Listing 文案</a><a href="#aplus">A+ 方案</a><a href="#risk">风险</a><a href="#actions">执行路线</a></nav>
  <section class="section" id="overview"><div class="section-head"><div><p class="eyebrow">Executive Overview</p><h2>经营决策总览</h2></div><p class="section-note">先看最大转化阻力和前三项动作，再进入文案与图片证据。</p></div>
    <div class="decision-grid"><div class="decision-statement"><small>管理层结论</small><h3>${escapeHtml(display(executive.primaryConversionBarrier, '当前证据不足以形成明确结论'))}</h3><p>${escapeHtml(display(executive.positioning, '请结合商品事实、评论和视觉证据继续核查。'))}</p></div>
      <aside class="quality-panel"><small>数据质量</small><strong>${escapeHtml(confidenceText)}</strong><p>视觉分析 ${escapeHtml(String(analyzedImageCount))} / ${escapeHtml(String(totalImageCount))} 张；合规风险 ${escapeHtml(String(complianceRisks.length))} 项；执行动作 ${escapeHtml(String(actionPlan.length))} 项。</p><p>${escapeHtml(display(list(audit.evidenceLimits)[0], '当前未记录额外证据限制。'))}</p></aside>
    </div>
    <div class="metrics">
      <div class="metric"><small>品牌</small><strong>${escapeHtml(brand)}</strong></div>
      <div class="metric"><small>价格</small><strong>${escapeHtml(display(listing.price))}</strong></div>
      <div class="metric"><small>评分</small><strong>${escapeHtml(display(listing.rating))}</strong></div>
      <div class="metric"><small>评论数</small><strong>${escapeHtml(display(listing.reviewCount))}</strong></div>
      <div class="metric"><small>商品素材</small><strong>${escapeHtml(String(imageUrls.length))} 张</strong></div>
      <div class="metric"><small>A+ 状态</small><strong>${escapeHtml(display(aplus.status || listing.aplusStatus))}</strong></div>
    </div>
    <div class="priority-grid">${(topPriorities.length ? topPriorities : actionPlan.slice(0, 3).map((item) => clean(item.task))).map((item, index) => `<article class="priority-card"><span>${index + 1}</span><p>${escapeHtml(item)}</p></article>`).join('') || '<p class="muted">当前没有可展示的优先动作。</p>'}</div>
  </section>
  <section class="section" id="visual"><div class="section-head"><div><p class="eyebrow">Visual Evidence</p><h2>图片与 A+ 证据墙</h2></div><p class="section-note">逐图展示可见事实、OCR、转化职责和改版机会；失败素材不会被推断。</p></div>
    <div class="evidence-wall">${evidenceCards || '<p class="muted">抓取源未返回可展示图片。</p>'}</div>
    <div class="two-col"><div class="diagnostic-block"><h3>点击与卖点表达</h3><p><strong>点击吸引：</strong>${escapeHtml(display(visualDiagnosis.clickAttraction))}</p><p><strong>卖点清晰度：</strong>${escapeHtml(display(visualDiagnosis.benefitClarity))}</p></div><div class="diagnostic-block issue"><h3>证据与疑虑消除</h3><p><strong>证据强度：</strong>${escapeHtml(display(visualDiagnosis.proofStrength))}</p><p><strong>疑虑消除：</strong>${escapeHtml(display(visualDiagnosis.doubtReduction))}</p></div></div>
    <h3 style="margin-top:24px">建议出图顺序</h3>${renderTable(['顺序','职责','目标','画面证据','文案方向'], list(visualDiagnosis.imagePlan).map((item) => [String(item.slot ?? ''), clean(item.role), clean(item.objective), clean(item.visualEvidence), clean(item.copyDirection)]))}
  </section>
  <section class="section" id="listing"><div class="section-head"><div><p class="eyebrow">Listing Copy</p><h2>Listing 文案诊断</h2></div><p class="section-note">将当前表达与建议版本并排，便于直接进入改稿流程。</p></div>
    <div class="copy-compare"><article class="copy-panel"><small>当前标题</small><p>${escapeHtml(productTitle)}</p></article><article class="copy-panel recommended"><small>推荐标题</small><p>${escapeHtml(display(title.recommendedTitle))}</p><p class="muted">${escapeHtml(display(title.rationale, ''))}</p></article></div>
    <div class="two-col"><div class="diagnostic-block"><h3>标题优势</h3>${renderList(title.strengths)}</div><div class="diagnostic-block issue"><h3>标题问题</h3>${renderList(title.issues)}</div></div>
    <h3 style="margin-top:26px">建议五点</h3>${renderList(bullets.recommendedBullets)}<h3 style="margin-top:26px">描述结构</h3>${renderList(description.recommendedStructure)}<h3 style="margin-top:26px">关键词主题</h3>${renderTags(searchTerms.keywordThemes)}
  </section>
  <section class="section" id="aplus"><div class="section-head"><div><p class="eyebrow">A+ Blueprint</p><h2>A+ 页面方案</h2></div><p class="section-note">当前状态：${escapeHtml(display(aplus.status || listing.aplusStatus))}</p></div><h3>当前缺口</h3>${renderList(aplus.currentGaps)}${renderTable(['顺序','模块','目标','文案方向','素材'], list(aplus.recommendedModules).map((item) => [String(item.order ?? ''), clean(item.module), clean(item.objective), clean(item.copyDirection), clean(item.assets)]))}</section>
  <section class="section" id="risk"><div class="section-head"><div><p class="eyebrow">Compliance</p><h2>合规与证据边界</h2></div><p class="section-note">风险结论仅基于当前可见 Listing 与图片证据，上线前仍需人工复核。</p></div>${renderTable(['等级','位置','问题','修正'], complianceRisks.map((item) => [clean(item.severity), clean(item.location), clean(item.issue), clean(item.correction)]))}<h3 style="margin-top:26px">证据边界</h3>${renderList(audit.evidenceLimits)}</section>
  <section class="section" id="actions"><div class="section-head"><div><p class="eyebrow">Execution Roadmap</p><h2>P0 / P1 / P2 执行路线图</h2></div><p class="section-note">每项动作保留原因与可交付物，便于分派和验收。</p></div>
    <div class="action-list">${actionPlan.map((item) => `<article class="action-item"><span class="priority ${priorityClass(item.priority)}">${escapeHtml(display(item.priority, '待确认'))}</span><strong>${escapeHtml(display(item.task))}</strong><p>${escapeHtml(display(item.reason))}</p><strong>${escapeHtml(display(item.deliverable))}</strong></article>`).join('') || '<p class="muted">当前没有可展示的执行动作。</p>'}</div>
    <h3 style="margin-top:30px">转化机会</h3>${renderTable(['优先级','杠杆','证据','动作','预期影响'], opportunities.map((item) => [clean(item.priority), clean(item.lever), clean(item.evidence), clean(item.action), clean(item.impact)]))}
  </section>
  <footer class="footer">该报告由 n8n Amazon Listing Audit v2 生成。商品事实和合规结论在上线前仍需人工复核。</footer>
</main></body></html>`;
const rendererVersion = 'amazon-listing-audit-html-v2';
const reportData = { runId, asin, status, rendererVersion, listing, visualAnalysis: visual, audit, generatedAt };
const manifest = { schemaVersion: 'amazon-listing-audit-artifact-v1', rendererVersion, runId, asin, latestHtmlKey, archiveHtmlKey, reportDataKey, generatedAt: reportData.generatedAt };
const artifact = (artifactType, s3Key, content, mimeType) => ({
  json: {
    artifactType,
    s3Key,
    publicUrl: deliveryUrl(artifactType, s3Key),
    gatewayUrl: gatewayUrl(s3Key),
    objectUrl: objectUrl(s3Key),
    contentType: mimeType,
    runId,
    asin,
    useShortUrl,
  },
  binary: { data: { data: Buffer.from(content, 'utf8').toString('base64'), fileName: s3Key.split('/').pop(), mimeType } },
});
return [
  artifact('html_latest', latestHtmlKey, html, 'text/html; charset=utf-8'),
  artifact('html_archive', archiveHtmlKey, html, 'text/html; charset=utf-8'),
  artifact('report_json', reportDataKey, JSON.stringify(reportData, null, 2), 'application/json; charset=utf-8'),
  artifact('manifest', manifestKey, JSON.stringify(manifest, null, 2), 'application/json; charset=utf-8'),
];
