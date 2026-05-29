/**
 * email-server.js — IdeaFlow local email proxy
 *
 * Runs on the Festo VPN PC (Node.js, no dependencies beyond built-ins).
 * Listens on http://localhost:3000 and forwards email requests to the
 * Festo internal mail API, which is only reachable from inside the VPN.
 *
 * Usage:
 *   node email-server.js
 *
 * Optional environment variables:
 *   PORT          — port to listen on (default: 3000)
 *   FESTO_MAIL_URL — override the Festo mail API URL
 *   ALLOWED_ORIGIN — CORS origin to allow (default: *)
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

// ── Configuration ─────────────────────────────────────────────────────────────

const PORT           = process.env.PORT           || 3000;
const FESTO_MAIL_URL = process.env.FESTO_MAIL_URL || 'https://prodconf-dev.de.festo.net/mailservice/api/sendMail';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the full body of an IncomingMessage and resolve with the parsed JSON.
 * Rejects on parse error or if the body exceeds MAX_BODY_BYTES.
 */
const MAX_BODY_BYTES = 1_000_000; // 1 MB safety cap

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;

    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Forward a POST request with JSON body to `targetUrl`.
 * Returns a Promise that resolves with { status, body }.
 */
function postJSON(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    const body     = JSON.stringify(payload);
    const parsed   = url.parse(targetUrl);
    const isHttps  = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.path,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      // Allow self-signed certs on internal Festo servers
      rejectUnauthorized: false,
    };

    const req = transport.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(new Error('Festo mail API request timed out')); });
    req.write(body);
    req.end();
  });
}

/**
 * Send a JSON response back to the browser.
 */
function respond(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type':                'application/json',
    'Content-Length':              Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  });
  res.end(body);
}

// ── Request handler ───────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const pathname = url.parse(req.url).pathname;

  // ── CORS pre-flight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age':       '86400',
      'Content-Length':               '0',
    });
    res.end();
    return;
  }

  // ── Health check ──
  if (req.method === 'GET' && pathname === '/health') {
    respond(res, 200, { ok: true, service: 'IdeaFlow email proxy', festo_mail_url: FESTO_MAIL_URL });
    return;
  }

  // ── Email send endpoint ──
  if (req.method === 'POST' && pathname === '/send-mail') {
    let payload;

    // 1. Parse request body
    try {
      payload = await readJSON(req);
    } catch (err) {
      console.error('[proxy] Bad request body:', err.message);
      respond(res, 400, { ok: false, error: err.message });
      return;
    }

    // 2. Validate required fields
    const { subject, text, recipients } = payload;
    if (!subject || typeof subject !== 'string') {
      respond(res, 400, { ok: false, error: 'Missing or invalid field: subject' });
      return;
    }
    if (!text || typeof text !== 'string') {
      respond(res, 400, { ok: false, error: 'Missing or invalid field: text (HTML body)' });
      return;
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      respond(res, 400, { ok: false, error: 'Missing or empty field: recipients (must be a non-empty array)' });
      return;
    }

    console.log(`[proxy] Sending "${subject}" → ${recipients.join(', ')}`);

    // 3. Forward to Festo mail API
    try {
      const { status, body } = await postJSON(FESTO_MAIL_URL, { subject, text, recipients });

      if (status >= 200 && status < 300) {
        console.log(`[proxy] Festo API responded ${status} — OK`);
        respond(res, 200, { ok: true, festo_status: status });
      } else {
        console.error(`[proxy] Festo API error ${status}:`, body);
        respond(res, 502, { ok: false, error: `Festo mail API returned ${status}`, detail: body });
      }
    } catch (err) {
      console.error('[proxy] Could not reach Festo mail API:', err.message);
      respond(res, 503, { ok: false, error: 'Could not reach Festo mail API. Is the VPN connected?', detail: err.message });
    }

    return;
  }

  // ── 404 fallback ──
  respond(res, 404, { ok: false, error: 'Not found. Use POST /send-mail' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║       IdeaFlow — Local Email Proxy Server        ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  Listening on  http://localhost:${PORT}              ║`);
  console.log(`  ║  Forwarding to ${FESTO_MAIL_URL.slice(0, 34)}…  ║`);
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log('  ║  Keep this terminal open while using IdeaFlow.   ║');
  console.log('  ║  Make sure the Festo VPN is connected.           ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[error] Port ${PORT} is already in use.`);
    console.error(`        Stop the other process or set PORT=<other> before running.\n`);
  } else {
    console.error('[error] Server error:', err);
  }
  process.exit(1);
});
