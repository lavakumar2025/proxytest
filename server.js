const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Hardcoded Hotstar Credentials from working link
const TARGET_STREAM_URL = "https://live09p.hotstar.com/mp2/incagbsgallow-biggboss-tel-2026/f129670ca03b4bb988c841f9bbdce777/index_6.m3u8";
const HOTSTAR_COOKIE = "hdntl=exp=1788915321~acl=%2f*~id=ce664760244f5188245a9776e013484c~data=hdntl~hmac=9d524a5d966a435827bddc85ca40839fc4c6041f4858bad384fe34a152b348e0";
const USER_AGENT = "Hotstar;in.startv.hotstar/25.02.24.8.11169@Premium Plugx(Android/15)";

// Status endpoint
app.get('/', (req, res) => {
  res.send('Hotstar Stream Proxy is Live and Ready!');
});

// Dynamic / Live Stream Handler
app.get('/live.m3u8', async (req, res) => {
  // Allow custom URL query or fall back to hardcoded default stream URL
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
      responseType: 'stream' // Pipe raw stream data directly
    });

    // Pass through key headers to the player
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers['content-type'] || 'application/vnd.apple.mpegurl');

    // Pipe response stream straight to NS Player / Web Player
    response.data.pipe(res);

  } catch (err) {
    console.error("Stream request error:", err.message);
    const statusCode = err.response ? err.response.status : 500;
    res.status(statusCode).send(`Error fetching stream: ${err.message}`);
  }
});

// Catch-all segment proxy endpoint for referenced .ts or sub .m3u8 files
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing target URL");

  try {
    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://www.hotstar.com/',
        'Origin': 'https://www.hotstar.com',
        'Cookie': HOTSTAR_COOKIE
      },
      responseType: 'stream'
    });

    res.set('Access-Control-Allow-Origin', '*');
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }
    response.data.pipe(res);

  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hotstar Raw Streamer listening on port ${PORT}`);
});
