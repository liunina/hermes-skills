const root = $('Finalize run-level synthesis').first().json || {};
const rendered = $input.first().json || {};
const ri = root.reportInput || {};
const synthesis = ri.marketSynthesis && typeof ri.marketSynthesis === 'object' ? ri.marketSynthesis : {};
const ownDecision = synthesis.ownDecision && typeof synthesis.ownDecision === 'object' ? synthesis.ownDecision : {};
const clean = (value) => String(value ?? '').trim();
const arr = (value) => Array.isArray(value) ? value : [];

function sanitizeUnknownAssetClaims(markdown) {
  let output = String(markdown || '');
  output = output.replace(/前\s*80\s*字符/gi, '前75字符');
  if (/数据源未返回|待确认|unknown/i.test(output)) {
    output = output
      .replace(/竞品无视频证据/g, '当前抓取未返回竞品视频证据')
      .replace(/无视频证据/g, '当前抓取未返回视频证据')
      .replace(/没有视频证据/g, '当前抓取未返回视频证据')
      .replace(/竞品无\s*A\+\s*证据/g, '当前抓取未返回竞品 A+ 证据')
      .replace(/无\s*A\+\s*证据/g, '当前抓取未返回 A+ 证据')
      .replace(/没有\s*A\+\s*证据/g, '当前抓取未返回 A+ 证据')
      .replace(/竞品\s*A\+\s*未返回/g, '竞品 A+ 状态待确认')
      .replace(/A\+\s*未返回/g, 'A+ 状态待确认')
      .replace(/竞品\s*A\+\s*缺失/g, '竞品 A+ 状态待确认')
      .replace(/A\+\s*缺失/g, 'A+ 状态待确认');
  }
  return output;
}

const report = sanitizeUnknownAssetClaims(clean(rendered.text || rendered.output || rendered.markdown) || '报告渲染器未返回最终综合报告。');
const ownAsin = clean(ri.ownAsin || ri.productIdea || ri.runId) || 'Amazon';
const title = `${ownAsin} - Amazon 竞品分析报告`;
const finalWikiPath = clean(ri.finalWikiPath || root.finalWikiPath);
const wikiArchivePath = `${finalWikiPath}/runs/${clean(ri.runId || root.runId)}`.replace(/^\/+|\/+$/g, '');
const wikiArchiveLink = wikiArchivePath ? `https://wiki.dinve.com/zh/${wikiArchivePath}` : '';

function entityAssetStatus(entity, key) {
  const analysis = entity?.analysis && typeof entity.analysis === 'object' ? entity.analysis : {};
  const listing = analysis.listing && typeof analysis.listing === 'object' ? analysis.listing : {};
  const completeness = listing.assetCompleteness || analysis.assetCompleteness || analysis.imageAplus?.assetCompleteness || {};
  return clean(completeness[key] ?? '').toLowerCase();
}

function categoryMismatch(categoryText, markdown) {
  const profiles = [
    { category: /枕|まくら|pillow|寝具/i, forbidden: /刀头|刀片|刃|充电|续航|衣物毛球|傘|日傘|防水伞|バスマット|脚垫/ },
    { category: /雨伞|雨傘|傘|日傘|umbrella/i, forbidden: /刀头|刀片|刃|充电续航|低反発まくら|枕头|バスマット|脚垫/ },
    { category: /脚垫|地垫|マット|バスマット|bath\s*mat/i, forbidden: /刀头|刀片|低反発まくら|枕头|雨伞|日傘/ },
    { category: /毛球|毛玉|lint\s*remover/i, forbidden: /低反発まくら|枕头|雨伞|日傘|バスマット/ },
  ];
  const profile = profiles.find((entry) => entry.category.test(categoryText));
  if (!profile) return null;
  const match = markdown.match(profile.forbidden);
  return match?.[0] || null;
}

function qaReport(markdown) {
  const issues = [];
  const warnings = [];
  const entities = [ri.ownBaseline, ...arr(ri.items)].filter(Boolean);
  const unknownAplus = entities.some((entity) => ['unknown', 'unknown_not_supported', 'unknown_fetch_failed'].includes(entityAssetStatus(entity, 'aplusStatus')));
  const unknownVideo = entities.some((entity) => ['unknown', 'unknown_not_supported', 'unknown_fetch_failed'].includes(entityAssetStatus(entity, 'videoStatus')));
  if (unknownAplus && /(?:没有|无|未发现|不存在)\s*A\+/i.test(markdown)) warnings.push({ code: 'APLUS_UNKNOWN_ABSENT_RISK', message: '至少一个 ASIN 的 A+ 状态为 unknown，报告中存在明确缺失表述。' });
  if (unknownVideo && /(?:没有|无|未发现|不存在)\s*(?:视频|视频证据)/i.test(markdown)) warnings.push({ code: 'VIDEO_UNKNOWN_ABSENT_RISK', message: '至少一个 ASIN 的视频状态为 unknown，报告中存在明确缺失表述。' });

  const requiredSections = ['## 0. 快速结论', '## 1. 数据完整性与抓取说明', '## 3. 竞品池概览', '## 4. AI 品类自适应竞争力评分', '## 8. 图片 / A+ / 视频转化漏斗', '## 12. P0 / P1 / P2 执行清单', '## 13. 失败 / 待补抓', '## 14. 数据与方法说明'];
  for (const required of requiredSections) if (!markdown.includes(required)) issues.push({ code: 'MISSING_SECTION', message: `缺少章节：${required}` });
  if (/前\s*80\s*字符/i.test(markdown)) issues.push({ code: 'TITLE_RULE_CONTRADICTION', message: '报告出现“前 80 字符”，与日本站 75 字符检查线冲突。' });
  if (/\uFFFD/.test(markdown)) issues.push({ code: 'REPLACEMENT_CHARACTER', message: '报告包含 Unicode replacement character，说明文本存在损坏。' });
  if (/gaallery/i.test(markdown)) issues.push({ code: 'TYPO_GAALLERY', message: '报告出现 gaallery 拼写异常。' });

  const categoryText = [ri.productIdea, synthesis.categoryScoringModel?.category, ri.ownBaseline?.title, ri.ownBaseline?.analysis?.listing?.title].map(clean).join(' ');
  const mismatch = categoryMismatch(categoryText, markdown);
  if (mismatch) issues.push({ code: 'CATEGORY_TEMPLATE_LEAK', message: `报告出现与当前品类不匹配的模板词：${mismatch}` });

  const titleCandidate = clean(synthesis.titleStrategy?.recommendedFormula);
  if (titleCandidate && Array.from(titleCandidate).length > 75 && /未超过检查线|符合\s*75\s*字符/.test(markdown)) issues.push({ code: 'TITLE_LENGTH_FALSE_PASS', message: '标题候选超过 75 字符，但报告写成通过检查。' });

  for (const action of arr(ownDecision.actionPlan)) {
    if (action?.id && !markdown.includes(clean(action.id))) issues.push({ code: 'ACTION_MISSING', message: `行动 ${action.id} 未进入报告。` });
    if (!arr(action?.evidenceRefs).length) warnings.push({ code: 'ACTION_WITHOUT_EVIDENCE', message: `行动 ${action?.id || action?.action || '-'} 缺少 evidenceRefs。` });
  }
  for (const insight of [...arr(ownDecision.opportunities), ...arr(ownDecision.risks)]) {
    if (insight?.id && !markdown.includes(clean(insight.id)) && !markdown.includes(clean(insight.insight))) warnings.push({ code: 'INSIGHT_NOT_RENDERED', message: `洞察 ${insight.id} 未在正文中定位。` });
  }

  const longParagraph = markdown.split(/\n{2,}/).find((paragraph) => !paragraph.startsWith('|') && !paragraph.startsWith('- ') && paragraph.length > 320);
  if (longParagraph) warnings.push({ code: 'LONG_PARAGRAPH', message: '存在超过 320 字的段落，建议继续拆分。' });
  return { passed: issues.length === 0, blockingIssues: issues.slice(0, 24), warnings: warnings.slice(0, 24), checkedAt: new Date().toISOString(), version: 'v4.1-report-qa' };
}

const reportQa = qaReport(report);
const reportVersion = clean(rendered.reportVersion) || 'v4.1-evidence-linked-renderer';
const archiveLine = wikiArchiveLink ? `- 本次 Wiki 归档: ${wikiArchiveLink}` : '';
const header = [
  `# ${title}`,
  '',
  `- Run ID: ${ri.runId}`,
  `- 我方 ASIN: ${ri.ownAsin || '无'}`,
  `- 竞品数量: ${ri.competitorCount || 0}`,
  `- 成功/失败: ${ri.successCount || 0} / ${ri.failedCount || 0}`,
  `- 状态: ${ri.status || root.status || 'unknown'}`,
  `- 报告版本: ${reportVersion}`,
  `- QA: ${reportQa.passed ? 'passed' : 'blocked'}`,
  ...(archiveLine ? [archiveLine] : []),
  `- 生成时间: ${ri.generatedAt || new Date().toISOString()}`,
  '',
  '---',
  '',
].join('\n');

const consistency = {
  opportunityCount: arr(ownDecision.opportunities).length,
  riskCount: arr(ownDecision.risks).length,
  actionCount: arr(ownDecision.actionPlan).length,
  scorecardCount: arr(synthesis.scorecards).length,
  successfulEntityCount: Number(ri.successCount || 0) + Number(Boolean(ri.ownBaseline?.status === 'success')),
};
const row = {
  runId: ri.runId,
  ownAsin: ri.ownAsin || '',
  ownProductUrl: ri.ownProductUrl || '',
  marketplace: ri.marketplace || 'amazon.co.jp',
  locale: ri.locale || 'zh-CN',
  status: ri.status,
  competitorCount: ri.competitorCount || 0,
  successCount: ri.successCount || 0,
  failedCount: ri.failedCount || 0,
  mode: root.mode || 'hybrid',
  finalWikiPath,
  finalWikiLink: '',
  errorSummary: arr(ri.failedItems).map((item) => `${item.competitorAsin}: ${item.errorType || 'failed'}`).join('; '),
  inputJson_object: JSON.stringify({ ...ri, reportQa, reportVersion, reportConsistency: consistency, wikiArchivePath, wikiArchiveLink }),
  startedAt: root.runRow?.startedAt || '',
  finishedAt: new Date().toISOString(),
};

return [{
  json: {
    ...root,
    title,
    markdown: header + report,
    row,
    reportInput: ri,
    reportQa,
    reportVersion,
    reportConsistency: consistency,
    publishWiki: Boolean(root.publishWiki && !root.dryRun && reportQa.passed),
    publishBlockedByQa: Boolean(root.publishWiki && !root.dryRun && !reportQa.passed),
    wikiPath: finalWikiPath,
    wikiArchivePath,
    wikiArchiveLink,
  },
}];
