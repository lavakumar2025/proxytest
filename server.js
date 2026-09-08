const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Working stream setup
const TARGET_STREAM_URL = "https://live09p.hotstar.com/mp2/incagbsgallow-biggboss-tel-2026/f129670ca03b4bb988c841f9bbdce777/index_6.m3u8";
const HOTSTAR_COOKIE = "hdntl=exp=1788915321~acl=%2f*~id=ce664760244f5188245a9776e013484c~data=hdntl~hmac=9d524a5d966a435827bddc85ca40839fc4c6041f4858bad384fe34a152b348e0";
const USER_AGENT = "Hotstar;in.startv.hotstar/25.02.24.8.11169@Premium Plugx(Android/15)";

app.get('/', (req, res) => {
  res.send('Local Hotstar Proxy Running!');
});

// Primary stream endpoint
app.get('/live.m3u8', async (req, res) => {
  const streamUrl = req.query.url || TARGET_STREAM_URL;
  const cookie = req.query.cookie || HOTSTAR_COOKIE;

  try {
    const response = await axios({
      method: 'get',
      url: streamUrl,
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://www.hotstar.com/',
        'Origin': 'https://www.hotstar.com',
        'Cookie': cookie
      },
      responseType: 'arraybuffer'
    });

    let content = response.data;
    const contentType = response.headers['content-type'] || '';

    // Rewrite relative sub-segment URLs to loop through the local server
    if (streamUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
      let manifestText = content.toString('utf-8');
      const host = `http://localhost:${PORT}`;

      manifestText = manifestText.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        let absoluteSegmentUrl;
        try {
          absoluteSegmentUrl = new URL(trimmed, streamUrl).href;
        } catch (e) {
          absoluteSegmentUrl = trimmed;
        }

        return `${host}/live.m3u8?url=${encodeURIComponent(absoluteSegmentUrl)}&cookie=${encodeURIComponent(cookie)}`;
      }).join('\n');

      content = Buffer.from(manifestText, 'utf-8');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', contentType || 'application/vnd.apple.mpegurl');
    res.send(content);

  } catch (err) {
    console.error("Local Fetch Error:", err.message);
    const statusCode = err.response ? err.response.status : 500;
    res.status(statusCode).send(`Error ${statusCode}: Local request to Hotstar failed.`);
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Local Server active at http://localhost:${PORT}`);
});
