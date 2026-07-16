(function () {
  'use strict';

  const root = document.documentElement;
  const dataNode = document.getElementById('report-data');
  if (!dataNode) return;

  let report = {};
  try { report = JSON.parse(dataNode.textContent || '{}'); } catch { report = {}; }
  const products = Array.isArray(report.products) ? report.products : [];
  const own = products.find((item) => item.itemRole === 'own') || products[0];
  const competitors = products.filter((item) => item.itemRole !== 'own');
  const byAsin = new Map(products.map((item) => [item.asin, item]));
  const defaultVisible = new Set(report.defaultVisibleAsins || products.slice(0, 4).map((item) => item.asin));
  if (own?.asin) defaultVisible.add(own.asin);
  const visible = new Set(defaultVisible);
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const number = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const formatNumber = (value) => value === null || value === undefined ? '待确认' : new Intl.NumberFormat('ja-JP').format(value);
  const score = (item) => number(item?.scorecard?.totalScore ?? item?.score ?? item?.competitiveScore);
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  document.body.appendChild(tooltip);
  const showTooltip = (event, html) => {
    tooltip.innerHTML = html;
    tooltip.classList.add('is-visible');
    tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
    tooltip.style.top = `${Math.min(window.innerHeight - 120, event.clientY + 14)}px`;
  };
  const hideTooltip = () => tooltip.classList.remove('is-visible');

  function renderSelector() {
    const container = $('#competitor-selector');
    if (!container) return;
    container.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'selector-label';
    label.textContent = '显示竞品';
    container.appendChild(label);
    products.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `selector-chip${item.itemRole === 'own' ? ' is-own' : ''}`;
      button.dataset.asin = item.asin;
      button.setAttribute('aria-pressed', visible.has(item.asin) ? 'true' : 'false');
      button.innerHTML = `<span class="selector-dot"></span>${item.itemRole === 'own' ? '我方' : '竞品'} · ${escape(item.asin)}`;
      button.addEventListener('click', () => {
        if (item.itemRole === 'own') return;
        if (visible.has(item.asin)) visible.delete(item.asin); else visible.add(item.asin);
        button.setAttribute('aria-pressed', visible.has(item.asin) ? 'true' : 'false');
        applyVisibility();
        renderMarketChart();
        renderScoreChart();
      });
      container.appendChild(button);
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'selector-chip';
    reset.textContent = '恢复默认前三';
    reset.addEventListener('click', () => {
      visible.clear();
      defaultVisible.forEach((asin) => visible.add(asin));
      renderSelector();
      applyVisibility();
      renderMarketChart();
      renderScoreChart();
    });
    container.appendChild(reset);
  }

  function applyVisibility() {
    $$('.product-card[data-asin]').forEach((card) => card.classList.toggle('is-hidden', !visible.has(card.dataset.asin)));
    $$('tbody tr[data-asin]').forEach((row) => row.classList.toggle('is-hidden', !visible.has(row.dataset.asin)));
    $$('.gallery-group[data-asin]').forEach((group) => group.classList.toggle('is-hidden', !visible.has(group.dataset.asin)));
    $$('[data-filtered-count]').forEach((node) => { node.textContent = `${visible.size} 个 ASIN 当前显示`; });
  }

  function svgText(x, y, text, attrs = '') {
    return `<text x="${x}" y="${y}" ${attrs}>${escape(text)}</text>`;
  }

  function renderMarketChart() {
    const container = $('#market-chart');
    if (!container) return;
    const rows = products.filter((item) => visible.has(item.asin)).map((item) => ({
      item,
      price: number(item.priceNumeric ?? item.price),
      rating: number(item.ratingNumeric ?? item.rating),
      reviews: number(item.reviewCountNumeric ?? item.reviewCount) || 0,
    })).filter((row) => row.price !== null && row.rating !== null);
    if (!rows.length) { container.innerHTML = '<div class="chart-empty">当前数据不足，无法生成价格 × 评分图</div>'; return; }
    const width = 720, height = 255, left = 58, right = 18, top = 18, bottom = 42;
    const minPrice = Math.min(...rows.map((row) => row.price));
    const maxPrice = Math.max(...rows.map((row) => row.price));
    const pricePad = Math.max(1, (maxPrice - minPrice) * .12);
    const x = (value) => left + ((value - (minPrice - pricePad)) / ((maxPrice + pricePad) - (minPrice - pricePad))) * (width - left - right);
    const y = (value) => top + ((5 - value) / 1.5) * (height - top - bottom);
    const bubble = (value) => 7 + Math.min(18, Math.sqrt(Math.max(value, 1)) / 5);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="价格评分竞争格局图">`;
    [3.5, 4, 4.5, 5].forEach((tick) => {
      const yy = y(tick);
      svg += `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#e7e1d7" stroke-width="1"/>`;
      svg += svgText(left - 10, yy + 4, tick.toFixed(1), 'fill="#667085" font-size="11" text-anchor="end"');
    });
    svg += `<line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#b9ae9c"/>`;
    svg += svgText(width / 2, height - 8, '价格（JPY）', 'fill="#667085" font-size="11" text-anchor="middle"');
    svg += svgText(16, height / 2, '评分', 'fill="#667085" font-size="11" transform="rotate(-90 16 ${height / 2})" text-anchor="middle"');
    rows.forEach(({ item, price, rating, reviews }) => {
      const fill = item.itemRole === 'own' ? '#17314e' : '#bd9652';
      const stroke = item.itemRole === 'own' ? '#bd9652' : '#fffdf9';
      const cx = x(price), cy = y(rating), radius = bubble(reviews);
      svg += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" fill-opacity=".86" stroke="${stroke}" stroke-width="2" data-chart-asin="${escape(item.asin)}" tabindex="0"/>`;
      svg += svgText(cx, cy - radius - 7, item.itemRole === 'own' ? '我方' : item.asin.slice(-4), 'fill="#17314e" font-size="10" font-weight="700" text-anchor="middle"');
    });
    svg += '</svg>';
    container.innerHTML = svg;
    $$('[data-chart-asin]', container).forEach((node) => {
      const item = byAsin.get(node.dataset.chartAsin);
      const html = `<strong>${item?.itemRole === 'own' ? '我方' : '竞品'} · ${escape(item?.asin)}</strong><br>价格：${escape(item?.price || '待确认')}<br>评分：${escape(item?.rating || '待确认')}<br>评论数：${escape(item?.reviewCount || '待确认')}<br>综合评分：${score(item) ?? '待评分'}`;
      node.addEventListener('mouseenter', (event) => showTooltip(event, html));
      node.addEventListener('mousemove', (event) => showTooltip(event, html));
      node.addEventListener('mouseleave', hideTooltip);
      node.addEventListener('focus', (event) => showTooltip(event, html));
      node.addEventListener('blur', hideTooltip);
    });
  }

  function renderScoreChart() {
    const container = $('#score-chart');
    if (!container) return;
    const rows = products.filter((item) => visible.has(item.asin) && score(item) !== null).sort((a, b) => score(b) - score(a));
    if (!rows.length) { container.innerHTML = '<div class="chart-empty">评分模型尚未返回，后续将显示品类自适应竞争力评分</div>'; return; }
    container.innerHTML = `<div class="score-bars">${rows.map((item) => `<div class="score-row"><div class="score-row-label" title="${escape(item.title)}">${item.itemRole === 'own' ? '我方' : escape(item.asin)}</div><div class="score-track"><div class="score-fill" style="width:${Math.max(0, Math.min(100, score(item)))}%"></div></div><div class="score-number">${Math.round(score(item))}</div></div>`).join('')}</div>`;
  }

  function initSorting() {
    const table = $('#comparison-table');
    if (!table) return;
    const body = $('tbody', table);
    $$('th[data-sort-key]', table).forEach((header) => {
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        const direction = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
        $$('th[data-sort-key]', table).forEach((item) => item.removeAttribute('data-sort-direction'));
        header.dataset.sortDirection = direction;
        const rows = $$('tr[data-asin]', body).sort((a, b) => {
          const av = number(a.dataset[key]) ?? a.dataset[key] ?? '';
          const bv = number(b.dataset[key]) ?? b.dataset[key] ?? '';
          if (typeof av === 'number' && typeof bv === 'number') return direction === 'asc' ? av - bv : bv - av;
          return direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
        rows.forEach((row) => body.appendChild(row));
      });
    });
  }

  function initLightbox() {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = '<button class="lightbox-close" type="button" aria-label="关闭图片">×</button><img alt="放大图片">';
    document.body.appendChild(lightbox);
    const image = $('img', lightbox);
    const close = () => lightbox.classList.remove('is-open');
    $('.lightbox-close', lightbox).addEventListener('click', close);
    lightbox.addEventListener('click', (event) => { if (event.target === lightbox) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    document.addEventListener('click', (event) => {
      const source = event.target.closest('.gallery figure img, .product-image, .visual-evidence-media img, .markdown-body img');
      if (!source) return;
      image.src = source.currentSrc || source.src;
      image.alt = source.alt || '';
      lightbox.classList.add('is-open');
    });
  }

  const listMarkup = (values, emptyText) => {
    const rows = Array.isArray(values) ? values.filter((value) => String(value ?? '').trim()) : [];
    return rows.length ? `<ul>${rows.map((value) => `<li>${escape(value)}</li>`).join('')}</ul>` : `<div class="empty compact">${escape(emptyText)}</div>`;
  };

  function renderVisualEvidence(details) {
    if (!details || details.dataset.rendered === 'true') return;
    const asin = details.dataset.visualAsin;
    const product = byAsin.get(asin);
    const container = $('[data-visual-evidence-grid]', details);
    if (!container || !product) return;
    const isOwn = product.itemRole === 'own';
    const results = Array.isArray(product.visualEvidence) ? product.visualEvidence : [];
    container.innerHTML = results.length ? results.map((result) => {
      const index = Number(result.index || 0) + 1;
      const advice = isOwn
        ? `${listMarkup(result.strengths, '未返回视觉优势')}${listMarkup(result.opportunities, '未返回逐图建议')}${listMarkup(result.risks, '未返回逐图风险')}`
        : `${listMarkup([...(result.referencePatterns || []), ...(result.strengths || [])], '未返回可借鉴亮点')}${listMarkup(result.opportunities, '未返回可迁移方向')}${listMarkup(result.risks, '未返回不可照搬或合规提示')}`;
      return `<article class="visual-evidence-card" id="asin-${escape(asin)}-image-${index}"><div class="visual-evidence-media">${result.displayUrl ? `<img loading="lazy" src="${escape(result.displayUrl)}" alt="${escape(asin)} ${escape(result.role || 'image')} ${index}">` : '<div class="empty">图片未返回</div>'}<span class="visual-image-role">${escape(result.role || 'image')} #${index}</span></div><div class="visual-evidence-body"><div class="visual-evidence-meta"><span>${escape(result.coreMessage || '未返回核心信息')}</span><span>清晰 ${escape(result.scores?.clarity ?? '-')} · 转化 ${escape(result.scores?.conversion ?? '-')}</span></div><div class="visual-evidence-columns"><div class="visual-evidence-block visual-evidence-ocr"><h5>文字识别（OCR）</h5>${listMarkup(result.ocrText, '未检测到可读文字')}</div><div class="visual-evidence-block"><h5>画面证据</h5><div class="evidence-subblock"><h6>可见元素</h6>${listMarkup(result.visibleElements || result.observations, '未返回画面元素证据')}</div><div class="evidence-subblock"><h6>可见主张</h6>${listMarkup(result.visibleClaims, '未返回可验证主张')}</div></div><div class="visual-evidence-block"><h5>${isOwn ? '视觉分析与改版建议' : '视觉分析与借鉴建议'}</h5>${advice}</div></div></div></article>`;
    }).join('') : '<div class="empty">未返回逐图视觉证据</div>';
    details.dataset.rendered = 'true';
  }

  function initLazyContent() {
    $$('.visual-evidence-details[data-visual-asin]').forEach((details) => {
      details.addEventListener('toggle', () => { if (details.open) renderVisualEvidence(details); });
    });
    const fullReport = $('[data-full-report]');
    const fullBody = $('[data-full-report-body]');
    const template = $('#full-report-template');
    if (fullReport && fullBody && template) {
      fullReport.addEventListener('toggle', () => {
        if (!fullReport.open || fullReport.dataset.rendered === 'true') return;
        fullBody.innerHTML = '';
        fullBody.appendChild(template.content.cloneNode(true));
        fullReport.dataset.rendered = 'true';
      });
    }
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a.decision-insight-link[href*="-image-"]');
      if (!link) return;
      const hash = link.getAttribute('href');
      const match = hash?.match(/^#asin-(B0[A-Z0-9]{8})-image-(\d+)$/i);
      if (!match) return;
      const group = document.getElementById(`asin-${match[1]}`);
      const details = group ? $('.visual-evidence-details', group) : null;
      if (!details) return;
      event.preventDefault();
      details.open = true;
      renderVisualEvidence(details);
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function initNavigation() {
    const links = $$('.quick-nav a');
    const targets = links.map((link) => document.getElementById(link.getAttribute('href').slice(1))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
    }), { rootMargin: '-25% 0px -60% 0px' });
    targets.forEach((target) => observer.observe(target));
  }

  renderSelector();
  applyVisibility();
  renderMarketChart();
  renderScoreChart();
  initSorting();
  initLazyContent();
  initLightbox();
  initNavigation();
  root.dataset.reportV2Ready = 'true';
})();
