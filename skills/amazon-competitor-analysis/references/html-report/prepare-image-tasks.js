const input = $input.first().json || {};
const ri = input.reportInput && typeof input.reportInput === 'object' ? input.reportInput : {};
const clean = (value) => String(value ?? '').trim();
const bounded = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
};
const trimSlash = (value) => clean(value).replace(/\/+$/, '');
const trimBoth = (value) => clean(value).replace(/^\/+|\/+$/g, '');
const safeSegment = (value, fallback = 'unknown') => clean(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const fnv1a = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const parseMaybe = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const flattenUrls = (value, output = []) => {
  if (!value) return output;
  if (typeof value === 'string') {
    const url = value.trim();
    if (/^https?:\/\//i.test(url)) output.push(url);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) flattenUrls(entry, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const key of ['url', 'src', 'link', 'large', 'hiRes', 'highRes', 'imageUrl', 'image_url']) {
      if (value[key]) flattenUrls(value[key], output);
    }
  }
  return output;
};
const firstUrl = (...values) => {
  for (const value of values) {
    const urls = flattenUrls(value, []);
    if (urls.length) return urls[0];
  }
  return '';
};
const uniqueUrls = (...values) => {
  const seen = new Set();
  const urls = [];
  for (const value of values) {
    for (const url of flattenUrls(value, [])) {
      const normalized = url.replace(/&amp;/g, '&').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
    }
  }
  return urls;
};

const runId = safeSegment(input.runId || ri.runId, 'run-' + Date.now());
const ownAsin = safeSegment(input.ownAsin || ri.ownAsin, 'market-' + runId);
const bucket = clean(input.s3Bucket) || 'amazon-reports';
const prefix = trimBoth(input.s3Prefix || 'amazon/competitor-analysis');
const endpointBaseUrl = trimSlash(input.endpointBaseUrl || 'https://data.dinve.com');
const publicBaseUrl = trimSlash(input.publicBaseUrl || `${endpointBaseUrl}/${bucket}`);
const shortBaseUrl = trimSlash(input.shortBaseUrl || '');
const useShortUrl = input.useShortUrl === true && Boolean(shortBaseUrl);
const styleVersion = safeSegment(input.styleVersion || 'v2', 'v2');
const maxProductImages = bounded(input.maxProductImages, 5, 0, 8);
const maxAplusImages = bounded(input.maxAplusImages, 4, 0, 8);
const archiveBaseKey = `${prefix}/${ownAsin}/runs/${runId}`;
const latestBaseKey = `${prefix}/${ownAsin}`;
const assetPrefix = styleVersion === 'v2' ? `${prefix}/_assets/report-v2` : `${prefix}/_assets`;
const cssKey = styleVersion === 'v2' ? `${assetPrefix}/css/report-v2.css` : `${assetPrefix}/css/report-${styleVersion}.css`;
const jsKey = styleVersion === 'v2' ? `${assetPrefix}/js/report-v2.js` : '';
const iconKey = styleVersion === 'v2' ? `${assetPrefix}/icons/report-icons.svg` : '';
const fontKeys = styleVersion === 'v2' ? [
  `${assetPrefix}/fonts/inter-latin-400.woff2`,
  `${assetPrefix}/fonts/inter-latin-600.woff2`,
  `${assetPrefix}/fonts/inter-latin-700.woff2`,
] : [];
const objectUrl = (key) => `${publicBaseUrl}/${trimBoth(key)}`;
const shortUrl = (key) => useShortUrl ? `${shortBaseUrl}/${trimBoth(key)}` : objectUrl(key);
const config = {
  runId,
  ownAsin,
  bucket,
  prefix,
  endpointBaseUrl,
  publicBaseUrl,
  shortBaseUrl,
  useShortUrl,
  styleVersion,
  archiveBaseKey,
  latestBaseKey,
  cssKey,
  jsKey,
  iconKey,
  fontKeys,
  assetPrefix,
  latestHtmlKey: `${latestBaseKey}/index.html`,
  archiveHtmlKey: `${archiveBaseKey}/index.html`,
  manifestKey: `${archiveBaseKey}/manifest.json`,
  reportDataKey: `${archiveBaseKey}/report-data.json`,
  // Native S3/MinIO object URLs do not resolve a directory to index.html.
  // A reverse proxy may intentionally provide directory-index behavior for
  // the short URL, but the standard bucket URL must target the real object.
  htmlReportUrl: useShortUrl ? `${shortBaseUrl}/${latestBaseKey}/` : objectUrl(`${latestBaseKey}/index.html`),
  htmlArchiveUrl: useShortUrl ? `${shortBaseUrl}/${archiveBaseKey}/` : objectUrl(`${archiveBaseKey}/index.html`),
  cssUrl: objectUrl(cssKey),
  jsUrl: jsKey ? objectUrl(jsKey) : '',
  iconUrl: iconKey ? objectUrl(iconKey) : '',
  maxProductImages,
  maxAplusImages,
};

const entities = [];
if (ri.ownBaseline) entities.push({ ...ri.ownBaseline, itemRole: 'own' });
for (const item of Array.isArray(ri.items) ? ri.items : []) entities.push({ ...item, itemRole: item.itemRole || 'competitor' });
const tasks = [];
for (const entity of entities) {
  const analysis = parseMaybe(entity.analysis || entity.analysisJson || {});
  const listing = parseMaybe(analysis.listing || analysis.listingData || analysis.product || {});
  const asin = safeSegment(entity.asin || entity.competitorAsin || listing.asin, 'unknown');
  const mainImageUrl = firstUrl(
    entity.mainImageUrl,
    listing.mainImageUrl,
    listing.main_image_url,
    analysis.mainImageUrl,
    analysis.main_image_url,
    listing.image,
    analysis.image,
  );
  const productUrls = uniqueUrls(
    listing.images,
    listing.imageUrls,
    listing.galleryImages,
    analysis.images,
    analysis.imageUrls,
    analysis.galleryImages,
    analysis.assets?.images,
  ).filter((url) => url !== mainImageUrl).slice(0, maxProductImages);
  const aplusUrls = uniqueUrls(
    listing.aplusImages,
    listing.aPlusImages,
    listing.a_plus_images,
    analysis.aplusImages,
    analysis.aPlusImages,
    analysis.a_plus_images,
    analysis.assets?.aplusImages,
  ).slice(0, maxAplusImages);
  const selected = [];
  if (mainImageUrl) selected.push({ assetRole: 'main', sourceUrl: mainImageUrl, assetIndex: 0 });
  productUrls.forEach((sourceUrl, assetIndex) => selected.push({ assetRole: 'product', sourceUrl, assetIndex }));
  aplusUrls.forEach((sourceUrl, assetIndex) => selected.push({ assetRole: 'aplus', sourceUrl, assetIndex }));
  for (const asset of selected) {
    const hash = fnv1a(asset.sourceUrl);
    const fileName = `${asin}-${asset.assetRole}-${String(asset.assetIndex + 1).padStart(2, '0')}-${hash}.jpg`;
    const s3Key = `${archiveBaseKey}/assets/images/${fileName}`;
    tasks.push({
      json: {
        config,
        asin,
        itemRole: entity.itemRole || 'competitor',
        assetRole: asset.assetRole,
        assetIndex: asset.assetIndex,
        sourceUrl: asset.sourceUrl,
        fileName,
        s3Key,
        publicUrl: objectUrl(s3Key),
      },
    });
  }
}

if (!tasks.length) {
  const fileName = `${ownAsin}-main-01-placeholder.jpg`;
  const s3Key = `${archiveBaseKey}/assets/images/${fileName}`;
  tasks.push({
    json: {
      config,
      asin: ownAsin,
      itemRole: 'own',
      assetRole: 'placeholder',
      assetIndex: 0,
      sourceUrl: 'https://data.dinve.com/amazon-reports/amazon/competitor-analysis/_assets/missing-image.png',
      fileName,
      s3Key,
      publicUrl: objectUrl(s3Key),
      forcePlaceholder: true,
    },
  });
}

return tasks;
