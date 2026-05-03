const fetch = require('node-fetch');
const FormData = require('form-data');

async function detectCaptcha(imgSrcOrDataUrl, endpoint) {
  let buffer;
  let contentType = 'image/png';

  if (imgSrcOrDataUrl.startsWith('data:')) {
    const [header, b64] = imgSrcOrDataUrl.split(',');
    contentType = header.split(':')[1].split(';')[0];
    buffer = Buffer.from(b64, 'base64');
  } else {
    const res = await fetch(imgSrcOrDataUrl);
    if (!res.ok) throw new Error(`CAPTCHA fetch ${res.status}`);
    buffer = await res.buffer();
    const ct = res.headers.get('content-type');
    if (ct) contentType = ct;
  }

  const form = new FormData();
  form.append('file', buffer, { filename: 'captcha.png', contentType });

  const res = await fetch(endpoint, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`OCR ${res.status}`);
  const data = await res.json();
  return data[0].description.trim();
}

module.exports = { detectCaptcha };
