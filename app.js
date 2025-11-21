// app.js
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 60 * 30 });

const REQUEST_HEADERS = {
  'User-Agent': 'Khalil-Hospitals-App/1.0 (contact@yourmail.com)',
  'Accept-Language': 'en',
  Referer: 'http://localhost'
};

// Multiple Overpass endpoints (try fallbacks if one is busy)
// You can add/remove endpoints as needed.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];

// Helper: sleep(ms)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Try posting to Overpass with retries and endpoint fallback
async function postOverpassWithRetries(query, opts = {}) {
  const maxRetriesPerEndpoint = opts.retriesPerEndpoint ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500; // initial backoff

  // Try each endpoint in order
  for (const endpoint of OVERPASS_ENDPOINTS) {
    let attempt = 0;
    while (attempt < maxRetriesPerEndpoint) {
      attempt++;
      try {
        // Increased timeout to tolerate longer queries
        const res = await axios.post(endpoint, query, {
          headers: { ...REQUEST_HEADERS, 'Content-Type': 'text/plain' },
          timeout: opts.timeoutMs ?? 60000 // 60s
        });

        // if status is OK return data
        if (res && res.status >= 200 && res.status < 300) {
          return res.data;
        }

        // Non-2xx: throw to trigger retry logic
        const err = new Error(`Overpass returned status ${res.status}`);
        err.response = res;
        throw err;

      } catch (err) {
        const status = err?.response?.status;
        console.warn(`[Overpass] endpoint=${endpoint} attempt=${attempt} status=${status || 'ERR'} message=${err.message}`);

        // If it's a 4xx (client) error, don't retry that endpoint
        if (status && status >= 400 && status < 500 && status !== 429) {
          // Bad request or similar - stop retries for this endpoint
          console.warn(`[Overpass] non-retriable status ${status} on ${endpoint}`);
          break;
        }

        // If we've exhausted attempts on this endpoint, break to try next endpoint
        if (attempt >= maxRetriesPerEndpoint) {
          console.warn(`[Overpass] exhausted attempts for ${endpoint}, switching to next endpoint`);
          break;
        }

        // Exponential backoff
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  // If we exit loop, all endpoints failed
  const allEndpoints = OVERPASS_ENDPOINTS.join(', ');
  throw new Error(`All Overpass endpoints failed (tried: ${allEndpoints})`);
}

// ---------------------------------------------------------
//  STATIC WILAYA BOUNDING BOXES (OSM admin_level=4)
//  Format: [south, west, north, east]
//  (same as you had — keep them accurate for best results)
// ---------------------------------------------------------
const WILAYAS = {
  "01": [35.4607, -1.3588, 35.9780, -0.5214],
  "02": [36.4931, 1.4724, 36.8981, 2.1134],
  "03": [26.9991, 8.1689, 32.0001, 12.0000],
  "04": [35.5370, -0.7617, 36.1674, 0.0971],
  "05": [35.9537, 4.7665, 36.5905, 5.4147],
  "06": [33.8062, 0.1076, 34.7598, 1.4118],
  "07": [34.6390, 5.8026, 35.5073, 6.8554],
  "08": [34.4500, 2.2400, 35.0500, 3.3000],
  "09": [36.3086, 4.2000, 36.7663, 5.0878],
  "10": [34.8003, 0.5002, 35.0373, 1.1252],
  "11": [36.1685, 3.7870, 36.8990, 4.8777],
  "12": [35.5300, -0.5000, 36.1200, 0.3500],
  "13": [36.5980, 2.7000, 37.1500, 3.3000],
  "14": [35.7820, 3.9400, 36.4200, 4.7800],
  "15": [36.4770, 3.9200, 36.8600, 4.5300],
  "16": [36.6222, 2.7542, 36.8800, 3.2561],
  "17": [34.7600, 2.4500, 35.3500, 3.3000],
  "18": [36.4000, 4.7000, 36.9000, 5.3500],
  "19": [36.5800, 5.0900, 37.0000, 5.6500],
  "20": [35.9500, 4.0000, 36.6000, 4.9000],
  "21": [36.2500, 5.0500, 36.9000, 5.7000],
  "22": [36.0542, 1.1532, 36.5789, 2.1420],
  "23": [36.8000, 7.5000, 37.1000, 7.9000],
  "24": [36.3300, 7.0800, 36.9000, 7.8500],
  "25": [36.7000, 5.6384, 37.0800, 6.4500],
  "26": [36.2120, 4.8160, 36.6800, 5.5000],
  "27": [35.6500, 1.4480, 36.1500, 2.4500],
  "28": [35.0000, 1.8000, 35.7000, 3.0000],
  "29": [36.0000, 1.0000, 36.7000, 1.9800],
  "30": [35.9500, 5.8500, 36.5000, 6.9000],
  "31": [35.5700, -1.1000, 36.2300, -0.2000],
  "32": [35.7300, 6.9200, 36.2000, 7.5000],
  "33": [28.5000, 0.5000, 33.0000, 6.5000],
  "34": [36.1500, 3.0000, 36.7500, 4.1500],
  "35": [36.4300, 5.2500, 36.9000, 6.1500],
  "36": [35.8400, 7.1000, 36.4000, 7.9000],
  "37": [35.3000, 1.9300, 36.5000, 3.3000],
  "38": [34.5000, 4.5000, 35.7500, 5.7500],
  "39": [35.1000, 3.6000, 35.9000, 4.9000],
  "40": [34.6000, 5.4000, 35.6000, 6.4500],
  "41": [36.0000, 6.1000, 36.7500, 7.2000],
  "42": [34.9000, 1.0000, 35.8000, 2.3000],
  "43": [35.8500, 0.4500, 36.7000, 1.4500],
  "44": [34.3000, 2.5000, 35.2000, 3.5000],
  "45": [35.9000, 7.5000, 36.4000, 8.2000],
  "46": [35.0000, 2.3000, 35.9000, 3.6000],
  "47": [33.0000, -1.0000, 34.6000, 1.2000],
  "48": [35.5000, 8.0000, 36.1000, 9.3000],
  "49": [29.5000, -0.2000, 31.0000, 2.0000],
  "50": [26.0000, 1.0000, 28.5000, 6.5000],
  "51": [34.0000, -1.5000, 35.2000, 0.0000],
  "52": [32.0000, 4.0000, 33.8000, 6.0000],
  "53": [36.1000, 0.4000, 36.8000, 1.4000],
  "54": [32.5000, 5.5000, 34.2000, 8.0000],
  "55": [36.3000, 4.5000, 36.9000, 5.8000],
  "56": [30.0000, 3.0000, 32.0000, 5.5000],
  "57": [34.5000, 3.5000, 35.9000, 6.0000],
  "58": [33.5000, 1.5000, 34.9000, 3.5000]
};

// Basic rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.get('/api/hospitals', async (req, res) => {
  try {
    const raw = String(req.query.wilaya || '').padStart(2, '0');
    const wilaya = raw;
    if (!WILAYAS[wilaya]) {
      return res.status(400).json({ error: 'Invalid wilaya number. Must be between 01 and 58.' });
    }

    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 1000);
    const cacheKey = `wilaya:${wilaya}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [south, west, north, east] = WILAYAS[wilaya];

    const overpassQuery = `
      [out:json][timeout:60];
      (
        node["amenity"="hospital"](${south},${west},${north},${east});
        way["amenity"="hospital"](${south},${west},${north},${east});
        relation["amenity"="hospital"](${south},${west},${north},${east});
      );
      out center ${limit};
    `;

    // Use helper to post the query with retries and fallbacks
    let overData;
    try {
      overData = await postOverpassWithRetries(overpassQuery, { timeoutMs: 60000, retriesPerEndpoint: 3, baseDelayMs: 500 });
    } catch (err) {
      console.error('[API] Overpass failed for wilaya', wilaya, err.message);
      return res.status(502).json({
        error: 'Failed to fetch hospitals from Overpass',
        details: err.message,
        note: 'This usually means the Overpass servers are overloaded or your query timed out. Try again in a minute or reduce the bounding box.'
      });
    }

    const elements = overData?.elements || [];
    const hospitals = elements.slice(0, limit).map(el => {
      const name = el.tags?.name || el.tags?.['name:en'] || null;
      const lat = el.lat ?? el.center?.lat ?? null;
      const lon = el.lon ?? el.center?.lon ?? null;
      return { name, lat, lon, tags: el.tags || {}, osm_type: el.type, osm_id: el.id };
    });

    const payload = {
      wilaya,
      bounding_box: { south, west, north, east },
      count: hospitals.length,
      hospitals,
      queried_at: new Date().toISOString()
    };

    cache.set(cacheKey, payload);
    return res.json(payload);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/', (req, res) => {
  res.send(`<h3>Algeria Hospitals API</h3><p>Use <code>/api/hospitals?wilaya=16</code></p>`);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
// the end