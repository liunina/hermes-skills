const state = $input.first().json || {};
const listing = state.listing || {};
const clean = (value) => String(value ?? '').trim();
const productImages = Array.isArray(listing.images) ? listing.images : [];
const aplusImages = Array.isArray(listing.aplusImages) ? listing.aplusImages : [];
const productLimit = Math.max(1, Math.min(12, Number(state.maxProductImages || 8)));
const aplusLimit = Math.max(0, Math.min(10, Number(state.maxAplusImages || 6)));
const images = [
  ...productImages.slice(0, productLimit).map((url, index) => ({
    url: clean(url),
    label: index === 0 ? 'main_image' : `gallery_${index}`,
    role: index === 0 ? 'main' : 'gallery',
    position: index,
  })),
  ...aplusImages.slice(0, aplusLimit).map((url, index) => ({
    url: clean(url),
    label: `aplus_${index + 1}`,
    role: 'aplus',
    position: Math.min(productImages.length, productLimit) + index,
  })),
].filter((entry) => /^https?:\/\//i.test(entry.url));
const prompt = [
  `分析 ${state.marketplace || listing.marketplace || 'Amazon'} Listing 的逐张商品图与 A+ 素材。`,
  '主图判断缩略图识别、主体占比、背景与文字合规。',
  '副图判断功能到利益到证据是否完整、移动端可读性和购买疑虑覆盖。',
  'A+ 判断品牌叙事、证明材料、规格、FAQ、对比和合规。',
  `分析说明使用 ${state.reportLanguage || 'zh-CN'}；只能依据可见像素，不得根据类目常识补造。`,
].join(' ');
return [{ json: {
  ...state,
  images,
  prompt,
  model: 'gemini-2.5-flash',
  batchSize: 3,
  maxOutputTokens: 7000,
  includeRawResponse: false,
  cacheMode: state.cacheMode || 'prefer_cache',
  writeCache: state.cacheMode !== 'bypass',
  cacheTtlHours: state.visualCacheTtlHours || 720,
  failureTtlHours: 6,
  promptVersion: 'amazon-listing-visual-v2',
  schemaVersion: 'amazon-image-analysis-v4',
  sourceAsin: state.asin || listing.asin || '',
  visualSelection: {
    productImageCount: Math.min(productImages.length, productLimit),
    aplusImageCount: Math.min(aplusImages.length, aplusLimit),
    totalImages: images.length,
  },
} }];
