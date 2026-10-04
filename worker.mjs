import { createRemoteJWKSet, jwtVerify } from 'jose';
import { cleanSnapshot, learnedCount, learnedKeys } from './cloud-model.js';

const COOKIE = 'nihongo_odyssey_session';
const SESSION_SECONDS = 7 * 86400;
const MAX_BODY_BYTES = 12_000_000;
const MAX_STORED_BYTES = 1_800_000;
const encoder = new TextEncoder();
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const routes = new Map([
  ['/api/config', ['GET']], ['/api/auth/google', ['POST']],
  ['/api/session', ['GET']], ['/api/logout', ['POST']], ['/api/progress', ['GET', 'PUT']],
]);

// The deployed handler always uses Google's remote JWKS. A supplied key resolver
// is only a module-level test seam, never read from a request or environment.
export function createGoogleVerifier(keys = googleKeys) {
  return async (credential, clientId) => {
    const { payload } = await jwtVerify(credential, keys, {
      algorithms: ['RS256'], audience: clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      requiredClaims: ['iss', 'aud', 'exp', 'sub', 'email_verified'],
    });
    if (!validIdentity(payload)) throw new Error('invalid_identity');
    return payload;
  };
}

function validIdentity(payload) {
  return typeof payload?.sub === 'string' && payload.sub.length > 0 &&
    payload.sub.length <= 255 && payload.sub.trim() === payload.sub && payload.email_verified === true;
}
function json(status, data, headers = {}) {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin', ...headers,
  } });
}
function sessionToken(request) {
  const value = (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new RangeError('too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('missing_body');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError('too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SyntaxError('invalid_body');
  return input;
}
async function pack(snapshot) {
  const stream = new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = await new Response(stream).arrayBuffer();
  if (bytes.byteLength > MAX_STORED_BYTES) throw new RangeError('too_large');
  return bytes;
}
async function unpack(bytes) {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
async function progressFor(db, id) {
  const row = await db.prepare('SELECT snapshot,revision,updated_at FROM progress WHERE user_id=?').bind(id).first();
  return row ? { snapshot: await unpack(row.snapshot), revision: row.revision, updatedAt: row.updated_at }
    : { snapshot: null, revision: 0, updatedAt: null };
}
async function userFor(db, token, time) {
  if (!token) return null;
  return db.prepare(`SELECT users.id,users.name,users.email FROM sessions
    JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires>?`)
    .bind(await hash(token), time).first();
}

export function createWorker({ verifyToken = createGoogleVerifier(), now = Date.now } = {}) {
  return {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      // Only dist is attached as static assets. Unknown paths never expose source.
      if (!path.startsWith('/api/')) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
      const methods = routes.get(path);
      if (!methods) return json(404, { error: 'not_found' });
      if (!methods.includes(request.method)) return json(405, { error: 'method_not_allowed' }, { Allow: methods.join(', ') });
      if (request.method !== 'GET' && (request.headers.get('Origin') !== env.APP_ORIGIN ||
          request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json')) {
        return json(403, { error: 'origin_rejected' });
      }
      if (path === '/api/config') return json(200, {
        googleClientId: env.GOOGLE_CLIENT_ID || null, configured: Boolean(env.GOOGLE_CLIENT_ID), storage: env.STORAGE_KIND || 'cloudflare-d1',
      });
      try {
        const db = env.DB;
        if (path === '/api/auth/google') {
          if (!env.GOOGLE_CLIENT_ID) return json(503, { error: 'google_not_configured' });
          const input = await readBody(request);
          if (typeof input.credential !== 'string' || !input.credential || input.credential.length > 20000) {
            return json(400, { error: 'invalid_credential' });
          }
          let payload;
          try { payload = await verifyToken(input.credential, env.GOOGLE_CLIENT_ID); }
          catch { return json(401, { error: 'invalid_credential' }); }
          if (!validIdentity(payload)) return json(401, { error: 'invalid_identity' });
          const user = { id: payload.sub, name: String(payload.name || 'Traveller').slice(0, 120), email: String(payload.email || '').slice(0, 254) };
          const token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
          const time = now();
          await db.batch([
            db.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email').bind(user.id, user.name, user.email),
            db.prepare('DELETE FROM sessions WHERE expires<=?').bind(time),
            db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await hash(token), user.id, time + SESSION_SECONDS * 1000),
          ]);
          return json(200, { user, ...await progressFor(db, user.id) }, {
            'Set-Cookie': `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`,
          });
        }
        const token = sessionToken(request);
        const user = await userFor(db, token, now());
        if (path === '/api/session') return json(200, { user: user || null, ...(user ? await progressFor(db, user.id) : {}) });
        if (path === '/api/logout') {
          const input = await readBody(request);
          if (input.expectedAccountId !== (user?.id ?? null)) return json(409, { error: 'account_changed' });
          if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
          // Never clear a shared browser cookie: a delayed logout response could
          // otherwise erase another tab's newly selected account.
          return json(200, { ok: true });
        }
        if (!user) return json(401, { error: 'sign_in_required' });
        if (request.method === 'GET') return json(200, await progressFor(db, user.id));
        const input = await readBody(request);
        if (input.expectedAccountId !== user.id) return json(409, { error: 'account_changed' });
        if (!Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= Number.MAX_SAFE_INTEGER) {
          return json(409, { error: 'revision_conflict', ...await progressFor(db, user.id) });
        }
        let snapshot;
        try { snapshot = cleanSnapshot(input.snapshot); }
        catch { return json(400, { error: 'invalid_progress' }); }
        const existing = await progressFor(db,user.id);
        if(existing.snapshot){const incoming=new Set(learnedKeys(snapshot));if(learnedKeys(existing.snapshot).some(id=>!incoming.has(id)))return json(409,{error:'newer_progress_exists',...existing});}
        const compressed = await pack(snapshot), learned = learnedCount(snapshot), time = now();
        // Each mutation is one atomic SQL statement. No read-then-upsert window:
        // exactly one request with a given revision can change this user's row.
        const saved = input.revision === 0
          ? await db.prepare(`INSERT INTO progress(user_id,snapshot,learned_count,revision,updated_at)
              VALUES(?,?,?,1,?) ON CONFLICT(user_id) DO NOTHING RETURNING revision,updated_at`)
            .bind(user.id, compressed, learned, time).first()
          : await db.prepare(`UPDATE progress SET snapshot=?,learned_count=?,revision=revision+1,updated_at=?
              WHERE user_id=? AND revision=? AND learned_count<=? RETURNING revision,updated_at`)
            .bind(compressed, learned, time, user.id, input.revision, learned).first();
        if (!saved) {
          const current = await progressFor(db, user.id);
          const regressive = current.revision === input.revision && current.snapshot &&
            learnedCount(current.snapshot) > learned;
          return json(409, { error: regressive ? 'newer_progress_exists' : 'revision_conflict', ...current });
        }
        return json(200, { revision: saved.revision, updatedAt: saved.updated_at });
      } catch (error) {
        if (error instanceof RangeError && error.message === 'too_large') return json(413, { error: 'request_too_large' });
        if (error instanceof SyntaxError || error instanceof TypeError) return json(400, { error: 'invalid_request' });
        return json(500, { error: 'service_unavailable' });
      }
    },
  };
}

export default createWorker();
