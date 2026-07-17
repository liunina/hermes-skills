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
const renderList = (items, empty = '暂无') => {
  const values = list(items).map((item) => clean(typeof item === 'object' ? (item.text || item.value || item.task || JSON.stringify(item)) : item)).filter(Boolean);
  return values.length ? `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : `<p class="muted">${escapeHtml(empty)}</p>`;
};
const renderTable = (headers, rows) => {
  if (!rows.length) return '<p class="muted">暂无数据</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
const css = `
:root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #182230; background: #f5f7fa; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: #f5f7fa; line-height: 1.62; }
a { color: #176b5b; }
img { max-width: 100%; }
.shell { width: min(1280px, calc(100% - 28px)); margin: 0 auto; padding: 20px 0 64px; }
.report-head { padding: 28px; border: 1px solid #dce2e8; border-radius: 8px; background: #ffffff; }
.kicker { margin: 0 0 6px; color: #176b5b; font-size: 12px; font-weight: 800; }
h1 { margin: 0; font-size: 32px; line-height: 1.25; overflow-wrap: anywhere; }
.full-title { display: none; }
.subtitle { margin: 10px 0 0; color: #526170; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.badge { display: inline-flex; align-items: center; min-height: 30px; padding: 4px 9px; border: 1px solid #dce2e8; border-radius: 6px; background: #f8fafb; font-size: 12px; font-weight: 700; }
.badge.good { color: #067647; border-color: #a6f4c5; background: #ecfdf3; }
.badge.warn { color: #93370d; border-color: #fedf89; background: #fffaeb; }
.badge.danger { color: #b42318; border-color: #fecdca; background: #fef3f2; }
.quick-nav { position: sticky; top: 8px; z-index: 5; display: flex; gap: 6px; overflow-x: auto; margin: 12px 0; padding: 8px; border: 1px solid #dce2e8; border-radius: 8px; background: rgba(255,255,255,.96); }
.quick-nav a { flex: 0 0 auto; padding: 5px 8px; border-radius: 5px; color: #344054; font-size: 12px; font-weight: 700; text-decoration: none; }
.quick-nav a:hover { background: #edf7f4; color: #176b5b; }
.section { padding: 26px 2px; border-top: 1px solid #dce2e8; }
.section:first-of-type { border-top: 0; }
.section h2 { margin: 0 0 14px; font-size: 22px; }
.section h3 { margin: 22px 0 9px; font-size: 16px; }
.metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 1px solid #dce2e8; border-radius: 8px; overflow: hidden; background: #fff; }
.metric { min-height: 94px; padding: 14px; border-right: 1px solid #dce2e8; }
.metric:last-child { border-right: 0; }
.metric small { display: block; color: #667085; font-size: 11px; }
.metric strong { display: block; margin-top: 7px; font-size: 17px; overflow-wrap: anywhere; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.gallery figure { margin: 0; border: 1px solid #dce2e8; border-radius: 8px; overflow: hidden; background: #fff; }
.gallery img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: contain; background: #fff; }
.gallery figcaption { padding: 7px 9px; color: #667085; font-size: 11px; }
.summary { padding: 18px; border-left: 4px solid #176b5b; background: #edf7f4; }
.summary p { margin: 5px 0; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.table-wrap { overflow-x: auto; border: 1px solid #dce2e8; border-radius: 8px; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 11px; border-bottom: 1px solid #e9edf1; text-align: left; vertical-align: top; }
th { color: #475467; background: #f8fafb; font-size: 11px; white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
ul { margin: 8px 0; padding-left: 20px; }
li { margin: 5px 0; }
.muted { color: #667085; }
.footer { margin-top: 18px; padding: 14px; border-top: 1px solid #dce2e8; color: #667085; font-size: 12px; }
@media (max-width: 900px) { .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); } .metric { border-bottom: 1px solid #dce2e8; } .two-col { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .shell { width: min(100% - 16px, 1280px); padding-top: 8px; } .report-head { padding: 20px 16px; } h1 { display: -webkit-box; overflow: hidden; font-size: 22px; -webkit-box-orient: vertical; -webkit-line-clamp: 6; } .full-title { display: block; margin-top: 8px; } .full-title summary { color: #176b5b; cursor: pointer; font-size: 12px; font-weight: 700; } .full-title p { margin: 8px 0 0; color: #475467; font-size: 13px; } .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .section { padding: 22px 0; } }
@media print { body { background: #fff; } .shell { width: 100%; padding: 0; } .quick-nav { display: none; } .section { break-inside: avoid; } }
`;
const html = `<!doctype html>
<html lang="${escapeHtml(source.reportLanguage || 'zh-CN')}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(display(listing.title, asin))} - Amazon Listing Audit</title><style>${css}</style></head>
<body><main class="shell">
  <header class="report-head">
    <p class="kicker">AMAZON LISTING AUDIT</p>
    <h1 title="${escapeHtml(display(listing.title, asin))}">${escapeHtml(display(listing.title, asin))}</h1>
    <details class="full-title"><summary>查看完整商品标题</summary><p>${escapeHtml(display(listing.title, asin))}</p></details>
    <p class="subtitle">${escapeHtml(display(executive.positioning, 'Listing 结构化诊断与转化优化报告'))}</p>
    <div class="meta"><span class="badge ${tone}">${escapeHtml(statusLabel)}</span><span class="badge">ASIN ${escapeHtml(asin)}</span><span class="badge">${escapeHtml(display(source.marketplace || listing.marketplace))}</span><span class="badge">Run ${escapeHtml(runId)}</span></div>
  </header>
  <nav class="quick-nav"><a href="#overview">总览</a><a href="#listing">文案</a><a href="#visual">视觉</a><a href="#aplus">A+</a><a href="#risk">合规</a><a href="#actions">执行</a></nav>
  <section class="section" id="overview"><h2>分析总览</h2>
    <div class="metrics">
      <div class="metric"><small>品牌</small><strong>${escapeHtml(display(listing.brand))}</strong></div>
      <div class="metric"><small>价格</small><strong>${escapeHtml(display(listing.price))}</strong></div>
      <div class="metric"><small>评分</small><strong>${escapeHtml(display(listing.rating))}</strong></div>
      <div class="metric"><small>评论数</small><strong>${escapeHtml(display(listing.reviewCount))}</strong></div>
      <div class="metric"><small>视觉状态</small><strong>${escapeHtml(display(visualDiagnosis.status || visual.status))}</strong></div>
      <div class="metric"><small>置信度</small><strong>${escapeHtml(confidenceText)}</strong></div>
    </div>
    <div class="summary"><p><strong>主要转化阻力：</strong>${escapeHtml(display(executive.primaryConversionBarrier))}</p><p><strong>优先动作：</strong>${escapeHtml(list(executive.topPriorities).join('；') || '待确认')}</p></div>
  </section>
  <section class="section"><h2>商品素材</h2>${imageUrls.length ? `<div class="gallery">${imageUrls.map((url, index) => `<figure><img loading="lazy" src="${escapeHtml(url)}" alt="Amazon 商品素材 ${index + 1}"><figcaption>${index === 0 ? '主图' : `素材 ${index + 1}`}</figcaption></figure>`).join('')}</div>` : '<p class="muted">抓取源未返回可展示图片。</p>'}</section>
  <section class="section" id="listing"><h2>Listing 文案诊断</h2><div class="two-col"><div><h3>标题优势</h3>${renderList(title.strengths)}<h3>标题问题</h3>${renderList(title.issues)}</div><div><h3>建议标题</h3><p>${escapeHtml(display(title.recommendedTitle))}</p><p class="muted">${escapeHtml(display(title.rationale, ''))}</p></div></div><h3>建议五点</h3>${renderList(bullets.recommendedBullets)}<h3>描述结构</h3>${renderList(description.recommendedStructure)}<h3>关键词主题</h3>${renderList(searchTerms.keywordThemes)}</section>
  <section class="section" id="visual"><h2>视觉转化诊断</h2><div class="two-col"><div><h3>点击吸引</h3><p>${escapeHtml(display(visualDiagnosis.clickAttraction))}</p><h3>卖点清晰度</h3><p>${escapeHtml(display(visualDiagnosis.benefitClarity))}</p></div><div><h3>证据强度</h3><p>${escapeHtml(display(visualDiagnosis.proofStrength))}</p><h3>疑虑消除</h3><p>${escapeHtml(display(visualDiagnosis.doubtReduction))}</p></div></div>${renderTable(['顺序','职责','目标','画面证据','文案方向'], list(visualDiagnosis.imagePlan).map((item) => [String(item.slot ?? ''), clean(item.role), clean(item.objective), clean(item.visualEvidence), clean(item.copyDirection)]))}</section>
  <section class="section" id="aplus"><h2>A+ 页面方案</h2><p><strong>数据状态：</strong>${escapeHtml(display(aplus.status))}</p><h3>当前缺口</h3>${renderList(aplus.currentGaps)}${renderTable(['顺序','模块','目标','文案方向','素材'], list(aplus.recommendedModules).map((item) => [String(item.order ?? ''), clean(item.module), clean(item.objective), clean(item.copyDirection), clean(item.assets)]))}</section>
  <section class="section" id="risk"><h2>合规与风险</h2>${renderTable(['等级','位置','问题','修正'], list(audit.complianceRisks).map((item) => [clean(item.severity), clean(item.location), clean(item.issue), clean(item.correction)]))}<h3>证据边界</h3>${renderList(audit.evidenceLimits)}</section>
  <section class="section" id="actions"><h2>执行清单</h2>${renderTable(['优先级','任务','原因','产出物'], list(audit.actionPlan).map((item) => [clean(item.priority), clean(item.task), clean(item.reason), clean(item.deliverable)]))}<h3>转化机会</h3>${renderTable(['优先级','杠杆','证据','动作','预期影响'], list(audit.conversionOpportunities).map((item) => [clean(item.priority), clean(item.lever), clean(item.evidence), clean(item.action), clean(item.impact)]))}</section>
  <footer class="footer">该报告由 n8n Amazon Listing Audit v2 生成。商品事实和合规结论在上线前仍需人工复核。</footer>
</main></body></html>`;
const reportData = { runId, asin, status, listing, visualAnalysis: visual, audit, generatedAt: new Date().toISOString() };
const manifest = { schemaVersion: 'amazon-listing-audit-artifact-v1', runId, asin, latestHtmlKey, archiveHtmlKey, reportDataKey, generatedAt: reportData.generatedAt };
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
