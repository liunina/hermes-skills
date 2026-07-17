const input = $input.first().json || {};
const clean = (value) => String(value ?? '').trim();
const bounded = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const markets = {
  'amazon.com': '10001', 'amazon.co.jp': '100-0001', 'amazon.co.uk': 'SW1A 1AA',
  'amazon.de': '10115', 'amazon.fr': '75001', 'amazon.it': '20121', 'amazon.es': '28001',
  'amazon.ca': 'M5V 2T6', 'amazon.com.mx': '06000', 'amazon.com.br': '01001-000',
  'amazon.com.au': '2000', 'amazon.in': '110001', 'amazon.nl': '1012 JS', 'amazon.se': '111 22',
  'amazon.pl': '00-001', 'amazon.sg': '018956', 'amazon.ae': 'Abu Dhabi', 'amazon.sa': '12211',
  'amazon.com.tr': '34000', 'amazon.eg': '11511', 'amazon.com.be': '1000',
};
const asinFrom = (value) => {
  const text = clean(value);
  for (const pattern of [/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i, /[?&]asin=([A-Z0-9]{10})(?=&|$)/i, /\b([A-Z0-9]{10})\b/i]) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return '';
};
const hostFrom = (value) => clean(value).match(/^https?:\/\/(?:www\.)?([^/?#]+)/i)?.[1]?.toLowerCase().replace(/^www\./, '') || '';
const sourceUrl = clean(input.productUrl || input.url);
const marketplace = clean(input.marketplace).toLowerCase().replace(/^www\./, '') || hostFrom(sourceUrl) || 'amazon.co.jp';
const competitorAsin = clean(input.asin).toUpperCase() || asinFrom(sourceUrl);
if (!/^[A-Z0-9]{10}$/.test(competitorAsin)) throw new Error('invalid_asin: expected a 10-character Amazon ASIN');
if (!markets[marketplace]) throw new Error(`unsupported_marketplace: ${marketplace}`);
const competitorUrl = `https://www.${marketplace}/dp/${competitorAsin}`;
const cacheModes = ['prefer_cache', 'refresh', 'cache_only', 'bypass'];
const requestedMode = clean(input.cacheMode).toLowerCase();
const cacheMode = cacheModes.includes(requestedMode) ? requestedMode : 'prefer_cache';
const listingSchemaVersion = 'amazon-listing-cache-v1';
const geo = clean(input.geo) || markets[marketplace];
const listingCacheKey = [marketplace, competitorAsin, geo, 'amazon', listingSchemaVersion].join('|');
return [{ json: {
  ...input,
  asin: competitorAsin,
  productUrl: competitorUrl,
  competitorAsin,
  competitorUrl,
  ownAsin: competitorAsin,
  ownProductUrl: competitorUrl,
  itemRole: 'own',
  marketplace,
  geo,
  cacheMode,
  decodoCacheTtlHours: bounded(input.decodoCacheTtlHours, 24, 1, 168),
  allowStaleOnError: input.allowStaleOnError !== false,
  staleMaxAgeHours: bounded(input.staleMaxAgeHours, 168, 1, 720),
  listingSchemaVersion,
  listingCacheKey,
} }];
