const downloaded = $input.all();
const tasks = $('Prepare image tasks').all();
const output = [];

const placeholderSvg = (asin, role) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0edff"/>
      <stop offset="1" stop-color="#e7f8f8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" rx="42" fill="url(#g)"/>
  <g fill="none" stroke="#8b7cf3" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".85">
    <rect x="386" y="218" width="428" height="322" rx="30"/>
    <circle cx="510" cy="330" r="42"/>
    <path d="M420 498l112-110 92 88 73-71 83 93"/>
  </g>
  <text x="600" y="646" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#3b2f77">${String(asin).replace(/[<>&]/g, '')}</text>
  <text x="600" y="706" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" fill="#667085">${String(role).replace(/[<>&]/g, '')} image unavailable</text>
</svg>`;

for (let index = 0; index < tasks.length; index += 1) {
  const task = tasks[index]?.json || {};
  const current = downloaded[index] || {};
  const currentBinary = current.binary?.data;
  const hasUsableBinary = Boolean(currentBinary?.data) && task.forcePlaceholder !== true;
  const binary = hasUsableBinary
    ? {
        ...currentBinary,
        fileName: task.fileName,
        mimeType: currentBinary.mimeType && currentBinary.mimeType !== 'application/octet-stream'
          ? currentBinary.mimeType
          : 'image/jpeg',
      }
    : {
        data: Buffer.from(placeholderSvg(task.asin, task.assetRole), 'utf8').toString('base64'),
        fileName: task.fileName,
        mimeType: 'image/svg+xml',
        fileExtension: 'svg',
      };
  output.push({
    json: {
      ...task,
      sourceFetchStatus: hasUsableBinary ? 'success' : 'placeholder',
      sourceFetchError: hasUsableBinary ? '' : String(current.json?.error?.message || current.json?.message || 'image_download_failed'),
    },
    binary: { data: binary },
    pairedItem: { item: index },
  });
}

return output;
