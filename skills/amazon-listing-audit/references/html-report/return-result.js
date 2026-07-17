const artifacts = $('Generate listing audit artifacts').all().map((item) => item.json || {});
const uploads = $input.all().map((item) => item.json || {});
const results = artifacts.map((artifact, index) => {
  const upload = uploads[index] || {};
  const success = upload.success === true && !upload.error;
  return {
    artifactType: artifact.artifactType,
    s3Key: artifact.s3Key,
    publicUrl: artifact.publicUrl,
    status: success ? 'success' : 'failed',
    errorMessage: success ? '' : String(upload.error?.message || upload.message || 's3_upload_failed'),
  };
});
const failed = results.filter((item) => item.status !== 'success');
const latest = results.find((item) => item.artifactType === 'html_latest');
const archive = results.find((item) => item.artifactType === 'html_archive');
const status = failed.length === 0 ? 'success' : (failed.length < results.length ? 'partial' : 'failed');
return [{ json: {
  ok: status !== 'failed',
  publishStatus: status,
  publishError: failed.map((item) => `${item.artifactType}: ${item.errorMessage}`).join('; '),
  htmlReportUrl: latest?.status === 'success' ? latest.publicUrl : '',
  htmlArchiveUrl: archive?.status === 'success' ? archive.publicUrl : '',
  artifacts: results,
} }];
