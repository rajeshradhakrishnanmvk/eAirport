const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const safePath = path.normalize(filePath).replace(/^\/+/, '');
  const resolvedPath = path.join(ROOT, safePath);

  fs.readFile(resolvedPath, (error, buffer) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(buffer);
  });
}

function getEnvValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function getCredentials(input = {}) {
  const clientId = input.clientId || input.client_id || getEnvValue('OPEN_SKY_CLIENT_ID', 'OS_CLIENT_ID', 'CLIENT_ID');
  const clientSecret = input.clientSecret || input.client_secret || getEnvValue('OPEN_SKY_CLIENT_SECRET', 'OS_CLIENT_SECRET', 'CLIENT_SECRET');
  return { clientId, clientSecret };
}

function buildAuthHeaders(clientId, clientSecret, token) {
  if (token) {
    return { Authorization: 'Bearer ' + token };
  }

  if (clientId && clientSecret) {
    const basic = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    return { Authorization: 'Basic ' + basic };
  }

  return {};
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const message = text || response.status + ' ' + response.statusText;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (!text) {
    return {};
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

async function exchangeClientCredentials(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    return null;
  }

  const tokenUrls = [
    'https://auth.opensky-network.org/realms/opensky-api/protocol/openid-connect/token',
    'https://auth.opensky-network.org/auth/realms/opensky-api/protocol/openid-connect/token',
    'https://opensky-network.org/realms/opensky-api/protocol/openid-connect/token',
  ];

  const parameterSets = [
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid',
    }),
  ];

  for (const tokenUrl of tokenUrls) {
    for (const body of parameterSets) {
      try {
        const result = await fetchJson(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (result && result.access_token) {
          return result.access_token;
        }
      } catch (_) {
        // Try the next auth URL if this one is unavailable.
      }
    }
  }

  return null;
}

function demoFlights(airport) {
  return [
    { callsign: 'AAL241', origin: airport, destination: 'LAX', altitude: 5400, heading: 42, status: 'departing', source: 'demo' },
    { callsign: 'DAL118', origin: airport, destination: 'ATL', altitude: 6200, heading: 52, status: 'departing', source: 'demo' },
    { callsign: 'SWA877', origin: airport, destination: 'MIA', altitude: 4700, heading: 39, status: 'holding', source: 'demo' },
    { callsign: 'JBU121', origin: airport, destination: 'SFO', altitude: 6800, heading: 58, status: 'cleared', source: 'demo' },
    { callsign: 'UAE512', origin: airport, destination: 'DXB', altitude: 7300, heading: 61, status: 'departing', source: 'demo' },
  ];
}

function normalizeFlightList(states, airport) {
  if (!Array.isArray(states)) {
    return demoFlights(airport);
  }

  return states
    .filter((item) => Array.isArray(item) && item[1] && String(item[1]).trim())
    .slice(0, 6)
    .map((item) => {
      const callsign = String(item[1]).trim();
      const altitude = Number(item[7] || 0);
      const heading = Number(item[10] || 0);
      const onGround = Boolean(item[8]);

      return {
        callsign,
        origin: airport,
        destination: onGround ? 'LIVE' : 'AIR',
        altitude,
        heading,
        status: onGround ? 'holding' : 'departing',
        source: 'live',
      };
    });
}

async function getLiveFlights(airport, input = {}) {
  const { clientId, clientSecret } = getCredentials(input);
  const token = await exchangeClientCredentials(clientId, clientSecret);
  const url = new URL('https://opensky-network.org/api/states/all');
  url.searchParams.set('lamin', '35.0');
  url.searchParams.set('lomin', '-85.0');
  url.searchParams.set('lamax', '45.0');
  url.searchParams.set('lomax', '-66.0');

  try {
    const payload = await fetchJson(url.toString(), {
      headers: buildAuthHeaders(clientId, clientSecret, token),
    });

    if (payload && Array.isArray(payload.states) && payload.states.length) {
      return { source: 'live', flights: normalizeFlightList(payload.states, airport) };
    }
  } catch (_) {
    // The sandbox may not have outbound access to OpenSky. Fall back to demo data instead.
  }

  return {
    source: 'demo',
    message: 'OpenSky live feed unavailable in this environment. A demo runway pattern is shown instead.',
    flights: demoFlights(airport),
  };
}

async function handleTokenRequest(req, res) {
  let payload = {};

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    payload = raw ? JSON.parse(raw) : {};
  } catch (_) {
    sendJson(res, 400, { error: 'Invalid request body' });
    return;
  }

  const { clientId, clientSecret } = getCredentials(payload);
  const token = await exchangeClientCredentials(clientId, clientSecret);

  if (!token) {
    sendJson(res, 401, { error: 'OpenSky client credentials are missing or invalid' });
    return;
  }

  sendJson(res, 200, { accessToken: token, source: 'opensky' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (req.url === '/api/token' || req.url.startsWith('/api/token?')) {
    await handleTokenRequest(req, res);
    return;
  }

  if (req.url.startsWith('/api/live')) {
    const airport = (url.searchParams.get('airport') || 'KJFK').toUpperCase();
    const credentials = {
      clientId: url.searchParams.get('clientId') || url.searchParams.get('client_id'),
      clientSecret: url.searchParams.get('clientSecret') || url.searchParams.get('client_secret'),
    };
    const payload = await getLiveFlights(airport, credentials);
    sendJson(res, 200, payload);
    return;
  }

  if (req.url === '/api/health') {
    sendJson(res, 200, { ok: true, port: PORT });
    return;
  }

  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  sendFile(res, requestPath);
});

server.listen(PORT, () => {
  console.log('eAirport running at http://localhost:' + PORT);
});
