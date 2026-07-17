const publication = $('Return listing audit artifact links').first().json || {};
const shortResponse = $input.first().json || {};
const gatewayResponse = $('Verify private listing audit gateway').first().json || {};
const inspect = (response) => {
  const statusCode = Number(response.statusCode || 0);
  const body =
    typeof response.body === 'string' ? response.body :
    typeof response.data === 'string' ? response.data : '';
  return { statusCode, ok: statusCode === 200 && /<!doctype\s+html/i.test(body) };
};
const shortDelivery = inspect(shortResponse);
const gatewayDelivery = inspect(gatewayResponse);
const requestedShortUrl = publication.useShortUrl === true;
const primaryDeliveryOk = shortDelivery.ok;
const fallbackDeliveryOk = !primaryDeliveryOk && gatewayDelivery.ok;
const uploadStatus = publication.publishStatus || 'failed';
let publishStatus = primaryDeliveryOk ? uploadStatus : 'failed';
if (fallbackDeliveryOk && uploadStatus !== 'failed') publishStatus = 'partial';
const shortError = requestedShortUrl && !primaryDeliveryOk
  ? `short_report_unavailable: HTTP ${shortDelivery.statusCode || 'network_error'}`
  : '';
const gatewayError = !gatewayDelivery.ok
  ? `private_report_gateway_unavailable: HTTP ${gatewayDelivery.statusCode || 'network_error'}`
  : '';
const publishError = [publication.publishError, shortError, gatewayError].filter(Boolean).join('; ');
const htmlReportUrl = primaryDeliveryOk
  ? (publication.htmlReportUrl || '')
  : fallbackDeliveryOk ? (publication.gatewayHtmlReportUrl || '') : '';
const htmlArchiveUrl = primaryDeliveryOk
  ? (publication.htmlArchiveUrl || '')
  : fallbackDeliveryOk ? (publication.gatewayHtmlArchiveUrl || '') : '';

return [{ json: {
  ...publication,
  ok: (primaryDeliveryOk || fallbackDeliveryOk) && uploadStatus !== 'failed',
  publishStatus,
  publishError,
  deliveryStatus: primaryDeliveryOk ? 'success' : fallbackDeliveryOk ? 'fallback' : 'failed',
  deliveryMode: primaryDeliveryOk ? (requestedShortUrl ? 'short_url' : 'gateway') : fallbackDeliveryOk ? 'gateway_fallback' : 'unavailable',
  deliveryHttpStatus: primaryDeliveryOk ? shortDelivery.statusCode : gatewayDelivery.statusCode,
  shortDeliveryStatus: shortDelivery.ok ? 'success' : 'failed',
  shortDeliveryHttpStatus: shortDelivery.statusCode,
  gatewayDeliveryStatus: gatewayDelivery.ok ? 'success' : 'failed',
  gatewayDeliveryHttpStatus: gatewayDelivery.statusCode,
  candidateHtmlReportUrl: publication.htmlReportUrl || '',
  htmlReportUrl,
  htmlArchiveUrl,
} }];
