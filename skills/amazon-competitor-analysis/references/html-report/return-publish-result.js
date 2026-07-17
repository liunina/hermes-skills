const artifacts = $('Generate report artifacts').all().map((item) => item.json || {});
const uploads = $input.all().map((item) => item.json || {});
const config = artifacts[0]?.config || $('Prepare image tasks').first().json?.config || {};
const artifactResults = artifacts.map((artifact, index) => {
  const upload = uploads[index] || {};
  const success = upload.success === true && !upload.error;
  return {
    artifactType: artifact.artifactType,
    s3Key: artifact.s3Key,
    publicUrl: artifact.publicUrl,
    contentType: artifact.contentType,
    hash: artifact.hash,
    status: success ? 'success' : 'failed',
    errorMessage: success ? '' : String(upload.error?.message || upload.message || 's3_upload_failed'),
  };
});
const failedArtifacts = artifactResults.filter((artifact) => artifact.status !== 'success');
const latest = artifactResults.find((artifact) => artifact.artifactType === 'html_latest');
const archive = artifactResults.find((artifact) => artifact.artifactType === 'html_archive');
const status = failedArtifacts.length === 0 ? 'success' : (failedArtifacts.length < artifactResults.length ? 'partial_success' : 'failed');

return [{ json: {
  ok: status !== 'failed',
  htmlPublishStatus: status,
  htmlPublishError: failedArtifacts.map((artifact) => `${artifact.artifactType}: ${artifact.errorMessage}`).join('; '),
  runId: config.runId,
  ownAsin: config.ownAsin,
  s3Bucket: config.bucket,
  htmlReportUrl: latest?.status === 'success' ? config.htmlReportUrl : '',
  htmlArchiveUrl: archive?.status === 'success' ? config.htmlArchiveUrl : '',
  htmlS3Key: config.latestHtmlKey,
  htmlArchiveKey: config.archiveHtmlKey,
  cssS3Key: config.cssKey,
  manifestS3Key: config.manifestKey,
  reportDataS3Key: config.reportDataKey,
  artifacts: artifactResults,
} }];
