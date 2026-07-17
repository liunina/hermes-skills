const source = $input.first().json || {};
const body = source.body && typeof source.body === 'object' ? source.body : {};
const input = { ...source, ...body };
const clean = (value) => String(value ?? '').trim();
const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = clean(value).toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', '是'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off', '否'].includes(normalized)) return false;
  return fallback;
};
const bounded = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const marketplaces = {
  'amazon.com': { geo: '10001', locale: 'en-US' },
  'amazon.co.jp': { geo: '100-0001', locale: 'ja-JP' },
  'amazon.co.uk': { geo: 'SW1A 1AA', locale: 'en-GB' },
  'amazon.de': { geo: '10115', locale: 'de-DE' },
  'amazon.fr': { geo: '75001', locale: 'fr-FR' },
  'amazon.it': { geo: '20121', locale: 'it-IT' },
  'amazon.es': { geo: '28001', locale: 'es-ES' },
  'amazon.ca': { geo: 'M5V 2T6', locale: 'en-CA' },
  'amazon.com.mx': { geo: '06000', locale: 'es-MX' },
  'amazon.com.br': { geo: '01001-000', locale: 'pt-BR' },
  'amazon.com.au': { geo: '2000', locale: 'en-AU' },
  'amazon.in': { geo: '110001', locale: 'en-IN' },
  'amazon.nl': { geo: '1012 JS', locale: 'nl-NL' },
  'amazon.se': { geo: '111 22', locale: 'sv-SE' },
  'amazon.pl': { geo: '00-001', locale: 'pl-PL' },
  'amazon.sg': { geo: '018956', locale: 'en-SG' },
  'amazon.ae': { geo: 'Abu Dhabi', locale: 'en-AE' },
  'amazon.sa': { geo: '12211', locale: 'ar-SA' },
  'amazon.com.tr': { geo: '34000', locale: 'tr-TR' },
  'amazon.eg': { geo: '11511', locale: 'ar-EG' },
  'amazon.com.be': { geo: '1000', locale: 'nl-BE' },
};
const extractAsin = (value) => {
  const text = clean(value);
  for (const pattern of [
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i,
    /[?&]asin=([A-Z0-9]{10})(?=&|$)/i,
    /\b([A-Z0-9]{10})\b/i,
  ]) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return '';
};
const extractMarketplace = (value) => {
  const text = clean(value);
  const match = text.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
  return clean(match?.[1]).toLowerCase().replace(/^www\./, '');
};
const rawUrl = clean(input.productUrl || input.url || input.amazonUrl || input.text || input.chatInput);
const explicitMarketplace = clean(input.marketplace).toLowerCase().replace(/^www\./, '');
const urlMarketplace = extractMarketplace(rawUrl);
const marketplace = explicitMarketplace || urlMarketplace || 'amazon.co.jp';
const asin = clean(input.asin).toUpperCase() || extractAsin(rawUrl);
const errors = [];
if (!/^[A-Z0-9]{10}$/.test(asin)) errors.push('需要有效的 10 位 Amazon ASIN 或商品链接');
if (!marketplaces[marketplace]) errors.push(`不支持的 Amazon 站点: ${marketplace || 'unknown'}`);
if (urlMarketplace && !marketplaces[urlMarketplace]) errors.push(`商品链接域名不在允许列表: ${urlMarketplace}`);
if (explicitMarketplace && urlMarketplace && explicitMarketplace !== urlMarketplace) errors.push('marketplace 与商品链接域名不一致');
const valid = errors.length === 0;
const market = marketplaces[marketplace] || marketplaces['amazon.co.jp'];
const productUrl = valid ? `https://www.${marketplace}/dp/${asin}` : rawUrl;
const now = new Date();
const nowIso = now.toISOString();
const compactStamp = nowIso.replace(/[-:TZ.]/g, '').slice(0, 14);
const runId = clean(input.runId) || `listing_${compactStamp}_${Math.random().toString(36).slice(2, 8)}`;
const cacheModes = ['prefer_cache', 'refresh', 'cache_only', 'bypass'];
const requestedCacheMode = clean(input.cacheMode).toLowerCase();
const cacheMode = cacheModes.includes(requestedCacheMode) ? requestedCacheMode : 'prefer_cache';
const dryRun = bool(input.dryRun, false);
const publishHtml = bool(input.publishHtml, true) && !dryRun;
const channelId = clean(input.channelId || input.channel_id);
const notifyMattermost = bool(input.notifyMattermost, Boolean(channelId)) && Boolean(channelId) && !dryRun;
const listingLocale = clean(input.listingLocale || input.locale) || market.locale;
const reportLanguage = clean(input.reportLanguage) || 'zh-CN';
const promptVersion = 'amazon-listing-audit-prompt-v2';
const schemaVersion = 'amazon-listing-audit-v2';
const normalized = {
  valid,
  validationErrors: errors,
  runId,
  asin,
  productUrl,
  marketplace,
  geo: clean(input.geo) || market.geo,
  listingLocale,
  reportLanguage,
  targetAudience: clean(input.targetAudience),
  positioning: clean(input.positioning || input.productPositioning),
  focus: clean(input.focus) || '标题、五点、描述、图片、A+、合规、转化与执行优先级',
  cacheMode,
  decodoCacheTtlHours: bounded(input.decodoCacheTtlHours, 24, 1, 168),
  visualCacheTtlHours: bounded(input.visualCacheTtlHours, 720, 1, 8760),
  allowStaleOnError: bool(input.allowStaleOnError, true),
  staleMaxAgeHours: bounded(input.staleMaxAgeHours, 168, 1, 720),
  maxProductImages: Math.floor(bounded(input.maxProductImages, 8, 1, 12)),
  maxAplusImages: Math.floor(bounded(input.maxAplusImages, 6, 0, 10)),
  publishHtml,
  notifyMattermost,
  channelId,
  mattermostBaseUrl: clean(input.mattermostBaseUrl) || 'http://mattermost-mattermost-1:8065',
  requestedBy: clean(input.requestedBy || input.user_name || input.userId || input.user_id),
  dryRun,
  promptVersion,
  schemaVersion,
  startedAt: clean(input.startedAt) || nowIso,
  attemptCount: Math.max(1, Math.floor(bounded(input.attemptCount, 1, 1, 10))),
};
normalized.runRow = {
  runId,
  asin,
  productUrl,
  marketplace,
  listingLocale,
  reportLanguage,
  status: valid ? 'queued' : 'rejected',
  phase: valid ? 'queued' : 'validation',
  visualStatus: 'pending',
  publishStatus: dryRun ? 'dry_run' : 'pending',
  htmlReportUrl: '',
  htmlArchiveUrl: '',
  title: '',
  brand: '',
  inputJson_object: JSON.stringify(normalized),
  listingJson_object: '',
  visualJson_object: '',
  auditJson_object: '',
  errorType: valid ? '' : 'invalid_input',
  errorMessage: errors.join('; '),
  notifyStatus: notifyMattermost ? 'pending' : 'disabled',
  requestedBy: normalized.requestedBy,
  channelId,
  startedAt: normalized.startedAt,
  lastUpdatedAt: nowIso,
  finishedAt: valid ? '' : nowIso,
  schemaVersion,
  promptVersion,
  attemptCount: normalized.attemptCount,
};
return [{ json: normalized }];
