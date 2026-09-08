const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Status route so visiting root does not throw "Cannot GET /"
app.get('/', (req, res) => {
  res.send('Hotstar Direct Render Proxy is Active and Running!');
});

// Stream endpoint
app.get('/stream', async (req, res) => {
  const targetUrl = req.query.url;
  const cookie = req.query.cookie;

  if (!targetUrl) {
    return res.status(400).send("Error: Missing 'url' parameter");
  }

  try {
    const response = await axios({
      method: 'get',
      url: targetUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'Hotstar;in.startv.hotstar/25.02.24.8.11169@Premium Plugx(Android/15)',
        'Referer': 'https://www.hotstar.com/',
        'Origin': 'https://www.hotstar.com',
        'Cookie': cookie ? decodeURIComponent(cookie) : ''
      },
      responseType: 'arraybuffer'
    });

    let content = response.data;
    const contentType = response.headers['content-type'] || '';

    // Rewrite .m3u8 playlists so chunk (.ts) requests flow back through Render
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
      let manifestText = content.toString('utf-8');
      const host = req.protocol + '://' + req.get('host');

      manifestText = manifestText.replace(/^(?!#)(.+)$/gm, (line) => {
        if (!line.trim()) return line;
        let segmentUrl = line.trim();
        if (!segmentUrl.startsWith('http')) {
          segmentUrl = new URL(segmentUrl, targetUrl).href;
        }
        return `${host}/stream?url=${encodeURIComponent(segmentUrl)}&cookie=${encodeURIComponent(cookie || '')}`;
      });

      content = Buffer.from(manifestText, 'utf-8');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', contentType || 'application/vnd.apple.mpegurl');
    res.send(content);

  } catch (err) {
    console.error("Direct Fetch Error:", err.message);
    const statusCode = err.response ? err.response.status : 500;
    res.status(statusCode).send(`Stream fetch failed with status ${statusCode}: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Direct Render Proxy listening on port ${PORT}`);
});
