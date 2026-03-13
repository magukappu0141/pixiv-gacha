const { fetchPage, extractOGP, UA_LIST, fetch } = require('./_utils');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const name = req.query.name;
  if (!name) return res.status(400).send('Missing name');

  const pageUrl = `https://dic.pixiv.net/a/${encodeURIComponent(name)}`;
  const { html } = await fetchPage(pageUrl);
  if (!html) return res.status(404).send('Page not found');

  const ogp = extractOGP(html);
  if (!ogp.imageUrl) return res.status(404).send('No image');

  // HTMLエンティティをデコード（&amp; → & 等）
  let imgUrl = ogp.imageUrl
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  if (imgUrl.startsWith('/')) imgUrl = 'https://dic.pixiv.net' + imgUrl;

  const refs = ['https://dic.pixiv.net/', 'https://www.pixiv.net/', 'https://t.co/'];
  for (const ref of refs) {
    try {
      const r = await fetch(imgUrl, {
        headers: { 'User-Agent': UA_LIST[3], 'Referer': ref, 'Accept': 'image/*' },
        redirect: 'follow',
        timeout: 5000,
      });
      if (r.ok) {
        const buffer = await r.buffer();
        res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        return res.send(buffer);
      }
    } catch (e) {}
  }
  return res.status(502).send('Image fetch failed');
};