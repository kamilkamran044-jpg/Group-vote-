import * as core from './core.mjs';

// Best-effort rate limit. Serverless instances do not share memory, so this only
// slows down simple abuse from one instance; it is not a hard guarantee.
const hits = new Map();
function limited(ip, bucket, max) {
  const key = ip + ':' + bucket;
  const now = Date.now();
  const rec = hits.get(key) || { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n += 1;
  hits.set(key, rec);
  if (hits.size > 5000) hits.clear();
  return rec.n > max;
}

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function readBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new core.HttpError(415, 'Bad request.');
  const text = await req.text();
  if (text.length > 20000) throw new core.HttpError(413, 'Request bohat bari hai.');
  try { return JSON.parse(text || '{}'); }
  catch (_) { throw new core.HttpError(400, 'Bad request.'); }
}

function sameOrigin(req, url) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === url.host; } catch (_) { return false; }
}

export function makeHandler(getStoreFn) {
  return async (req, context = {}) => {
    try {
      const url = new URL(req.url);
      if (!sameOrigin(req, url)) return json(403, { error: 'Forbidden' });
      const path = url.pathname.replace(/^\/api/, '');
      const store = getStoreFn();
      const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';

      if (req.method === 'POST' && path === '/polls') {
        if (limited(ip, 'create', 20)) return json(429, { error: 'Too many requests, thori der baad try karein.' });
        return json(200, await core.createPoll(store, await readBody(req)));
      }

      const m = path.match(/^\/polls\/([a-z0-9]+)(\/vote)?$/i);
      if (m) {
        if (req.method === 'GET' && !m[2]) return json(200, await core.getPoll(store, m[1]));
        if (req.method === 'POST' && m[2]) {
          if (limited(ip, 'vote', 60)) return json(429, { error: 'Too many requests, thori der baad try karein.' });
          return json(200, await core.vote(store, m[1], await readBody(req)));
        }
        return json(405, { error: 'Method not allowed' });
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof core.HttpError) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Server error, dobara try karein.' });
    }
  };
    }
