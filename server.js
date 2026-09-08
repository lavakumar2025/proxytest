const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
app.use(cors());

// ProxyScrape API for Fresh Indian Proxies
const PROXYSCRAPE_API = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&country=in';

let activeProxies = [];

// Helper function to create the appropriate agent based on proxy protocol
function getProxyAgent(proxyUrl) {
  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

// 1. Fetch & Filter Fresh Working Proxies from ProxyScrape
async function refreshProxyList() {
  console.log("Fetching fresh Indian proxy list from ProxyScrape...");
  try {
    const response = await axios.get(PROXYSCRAPE_API, { timeout: 10000 });
    const proxyLines = response.data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log(`Retrieved ${proxyLines.length} raw proxies. Testing for active connections...`);

    const testedProxies = [];

    // Test proxies concurrently
    await Promise.allSettled(
      proxyLines.map(async (proxyUrl) => {
        try {
          const agent = getProxyAgent(proxyUrl);
          // Ping Hotstar with a 3-second connection timeout test
          await axios.get('https://www.hotstar.com', {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: 3000,
            headers: {
              'User-Agent': 'Hotstar;in.startv.hotstar/25.02.24.8.11169@Premium Plugx(Android/15)'
            }
          });
          testedProxies.push(proxyUrl);
          console.log(`[WORKING PROXY]: ${proxyUrl}`);
        } catch (err) {
          // Silent catch for failed proxy connections
        }
      })
    );

    activeProxies = testedProxies;
    console.log(`Proxy Refresh Complete! ${activeProxies.length} active proxies ready.`);

  } catch (err) {
    console.error("Failed to update ProxyScrape list:", err.message);
  }
}

// Run proxy fetch immediately on startup, then re-check every 10 minutes
refreshProxyList();
setInterval(refreshProxyList, 10 * 60 * 1000);

// 2. Main Stream Proxy Endpoint
app.get('/stream', async (req, res) => {
  const targetUrl = req.query.url;
  const cookie = req.query.cookie;

  if (!targetUrl) {
    return res.status(400).send("Error: Missing 'url' parameter");
  }

  // Fallback to direct request if no proxies are currently live
  const proxyListToTry = activeProxies.length > 0 ? activeProxies : [null];

  let success = false;
  let lastError = "";

  for (const proxyUrl of proxyListToTry) {
    try {
      const config = {
        method: 'get',
        url: targetUrl,
        timeout: 8000,
        headers: {
          'User-Agent': 'Hotstar;in.startv.hotstar/25.02.24.8.11169@Premium Plugx(Android/15)',
          'Referer': 'https://www.hotstar.com/',
          'Origin': 'https://www.hotstar.com',
          'Cookie': cookie ? decodeURIComponent(cookie) : ''
        },
        responseType: 'arraybuffer'
      };

      if (proxyUrl) {
        const agent = getProxyAgent(proxyUrl);
        config.httpsAgent = agent;
        config.httpAgent = agent;
      }

      const response = await axios(config);
      let content = response.data;
      const contentType = response.headers['content-type'] || '';

      // Rewrite .m3u8 manifests so child .ts segment links keep passing through this Render proxy
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
      break;

    } catch (err) {
      lastError = err.message;
      if (proxyUrl) {
        console.log(`Proxy ${proxyUrl} failed on stream request, trying next...`);
      }
    }
  }

  if (!success) {
    res.status(500).send(`Stream request failed across available proxies. Error: ${lastError}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dynamic Proxy Server active on port ${PORT}`);
});
