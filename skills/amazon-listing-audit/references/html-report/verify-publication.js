const publication = $('Return listing audit artifact links').first().json || {};
const response = $input.first().json || {};
const statusCode = Number(response.statusCode || 0);
const body =
  typeof response.body === 'string' ? response.body :
  typeof response.data === 'string' ? response.data : '';
const deliveryOk = statusCode === 200 && /<!doctype\s+html/i.test(body);
const uploadStatus = publication.publishStatus || 'failed';
const publishStatus = deliveryOk ? uploadStatus : 'failed';
const verificationError = deliveryOk
  ? ''
  : `public_report_unavailable: HTTP ${statusCode || 'network_error'}`;
const publishError = [publication.publishError, verificationError].filter(Boolean).join('; ');

return [{ json: {
  ...publication,
  ok: deliveryOk && uploadStatus !== 'failed',
  publishStatus,
  publishError,
  deliveryStatus: deliveryOk ? 'success' : 'failed',
  deliveryHttpStatus: statusCode,
  candidateHtmlReportUrl: publication.htmlReportUrl || '',
  htmlReportUrl: deliveryOk ? (publication.htmlReportUrl || '') : '',
  htmlArchiveUrl: deliveryOk ? (publication.htmlArchiveUrl || '') : '',
} }];
