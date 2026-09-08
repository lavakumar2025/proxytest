const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
app.use(cors());

// List of Indian proxies provided from ProxyScrape
const INDIAN_PROXIES = [
  "http://219.65.73.81:80",
  "http://151.185.59.36:8080",
  "http://151.185.58.17:80",
  "http://43.245.136.225:8080",
  "http://103.246.194.251:3128",
  "http://203.192.217.6:8080",
  "socks5://144.24.111.128:1088",
  "socks4://136.233.136.41:43314"
];

function getProxyAgent(proxyUrl) {
  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

app.get('/stream', async (req, res) => {
  const targetUrl = req.query.url;
  const cookie = req.query.cookie;

  if (!targetUrl) {
    return res.status(400).send("Error: Missing 'url' parameter");
  }

  let success = false;
  let lastError = "";

  // Attempt request across proxy list until one succeeds
  for (const proxyUrl of INDIAN_PROXIES) {
    try {
      console.log(`Attempting request via proxy: ${proxyUrl}`);
      const agent = getProxyAgent(proxyUrl);

      const response = await axios({
        method: 'get',
        url: targetUrl,
        httpsAgent: agent,
        httpAgent: agent,
        timeout: 8000, // 8 second timeout per proxy attempt
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

      // Rewrite .m3u8 playlists so segment (.ts) requests pass back through this Render proxy
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
      
      success = true;
      break; // Exit loop on successful response
    } catch (err) {
      console.log(`Failed with proxy ${proxyUrl}: ${err.message}`);
      lastError = err.message;
    }
  }

  if (!success) {
    res.status(500).send(`All Indian Proxies Failed. Last error: ${lastError}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Render Hotstar Proxy active on port ${PORT}`);
});
