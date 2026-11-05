import 'dotenv/config';
import { mountMlOwnedRoutes } from './ml-owned-routes.js';
import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildOverview } from './metrics.js';
import { parseStravaExport } from './strava-import.js';
import { toActivity, listActivities } from './activity-list.js';
import { buildSportProfile } from './profile-analytics.js';
import { sanitizeHeartSeries, parseWebhookEvent, secureTextEquals } from './strava-events.js';
import { recommendRouteWithAI } from './routes/route-recommender.js';

const PORT = Number(process.env.PORT || 3001);
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
// Orígenes adicionales explícitos para probar desde el móvil por Wi-Fi, sin abrir CORS a cualquier web.
const FRONTEND_ALLOWED_ORIGINS = new Set([FRONTEND_URL, ...String(process.env.FRONTEND_ALLOWED_ORIGINS || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean)]);
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI || `http://localhost:${PORT}/api/strava/callback`;
const STRAVA_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_SECRET = process.env.STRAVA_CLIENT_SECRET;
const WEBHOOK_SECRET = process.env.STRAVA_WEBHOOK_SECRET || '';
const WEBHOOK_VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || '';
const WEBHOOK_SUBSCRIPTION_ID = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID || ''; 
const ENC_KEY = process.env.TOKEN_ENCRYPTION_KEY && /^[a-fA-F0-9]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY)
  ? Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex') : null;
const isProduction = process.env.NODE_ENV === 'production';
const COOKIE = 'race_session';
const SESSION_SECONDS = 7 * 24 * 3600;
const CACHE_MS = 15 * 60 * 1000;
const cachedOverview = new Map();
const cachedStravaActivities = new Map();
const cachedHeartStreams = new Map();
// La caché contiene datos deportivos solo durante el tiempo imprescindible.
const purgeCache = setInterval(() => {
  for (const cache of [cachedOverview, cachedStravaActivities, cachedHeartStreams]) {
    for (const [id, entry] of cache) {
      if (Date.now() - entry.ts >= CACHE_MS) cache.delete(id);
    }
  }
}, 60_000);
purgeCache.unref();

// Protección básica local frente a intentos masivos; antes de producción usar un límite distribuido.
const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const old = authAttempts.get(key);
  const bucket = !old || old.reset < now ? { count: 0, reset: now + 15 * 60_000 } : old;
  bucket.count++;
  authAttempts.set(key, bucket);
  if (bucket.count > 20) return res.status(429).json({ error: 'Demasiados intentos. Vuelve a probar dentro de 15 minutos.' });
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of authAttempts) if (b.reset < now) authAttempts.delete(key);
}, 15 * 60_000).unref();

const DB_PATH = process.env.DB_PATH || resolve('data', 'app.sqlite');
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS imported_activities (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL, name TEXT NOT NULL, sport_type TEXT NOT NULL,
    start_date TEXT NOT NULL, distance REAL NOT NULL, moving_time REAL NOT NULL,
    elevation_gain REAL NOT NULL, PRIMARY KEY(user_id, activity_id)
  );
  CREATE TABLE IF NOT EXISTS import_info (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    updated_at INTEGER NOT NULL, skipped INTEGER NOT NULL, no_moving_time INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS strava_events (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_event_at INTEGER NOT NULL, last_event_kind TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS strava_connections (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    athlete_id TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL,
    access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at INTEGER NOT NULL
  );
`);
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());

function clearStravaCache(userId) {
  cachedOverview.delete(userId);
  cachedStravaActivities.delete(userId);
  for (const key of cachedHeartStreams.keys()) if (key.startsWith(`${userId}:`)) cachedHeartStreams.delete(key);
}
function digest(x) { return crypto.createHash('sha256').update(x).digest('hex'); }
function randomToken() { return crypto.randomBytes(32).toString('hex'); }
function encrypt(value) {
  if (!ENC_KEY) throw new Error('Falta TOKEN_ENCRYPTION_KEY: configura backend/.env');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decrypt(value) {
  if (!ENC_KEY) throw new Error('Falta TOKEN_ENCRYPTION_KEY: configura backend/.env');
  const input = Buffer.from(value, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, input.subarray(0, 12));
  decipher.setAuthTag(input.subarray(12, 28));
  return Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString('utf8');
}
function getCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(s => {
    const i = s.indexOf('=');
    return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  }));
}
function account(req, res, next) {
  const token = getCookies(req)[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  const sessionHash = digest(token);
  const user = db.prepare(`SELECT users.id, users.name, users.email FROM users
    JOIN sessions ON sessions.user_id=users.id
    WHERE sessions.token_hash=? AND sessions.expires_at > ?`).get(sessionHash, Date.now());
  if (!user) return res.status(401).json({ error: 'La sesión ha caducado.' });
  req.user = user;
  req.sessionHash = sessionHash;
  next();
}
function cookieOpts() {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS * 1000 };
}
function createSession(res, userId) {
  const token = randomToken();
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(digest(token), userId, Date.now() + SESSION_SECONDS * 1000);
  res.cookie(COOKIE, token, cookieOpts());
}
function csrfSameOrigin(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  // Vite usa un proxy: el navegador siempre envía el Origin del frontend.
  if (origin && !FRONTEND_ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'Origen no permitido.' });
  next();
}
function publicError(e, fallback = 'No se pudo completar la operación.') {
  console.error('[API]', e?.message || e);
  if (e?.status === 429) return { status: 429, message: 'Límite de peticiones de Strava alcanzado. Inténtalo más tarde.' };
  if (e?.status === 401 || e?.status === 403) return { status: 502, message: 'Strava no permite acceder a estos datos. Prueba a reconectar tu cuenta.' };
  return { status: 502, message: fallback };
}
function requireStravaConfig() {
  if (!STRAVA_ID || !STRAVA_SECRET || !ENC_KEY) {
    const err = new Error('Debes configurar STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET y TOKEN_ENCRYPTION_KEY.');
    err.status = 503;
    throw err;
  }
}
async function stravaFetch(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.message || `Strava respondió ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}
async function stravaToken(params) {
  return stravaFetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: STRAVA_ID, client_secret: STRAVA_SECRET, ...params })
  });
}
function saveConnection(userId, tokens, scopes) {
  const athleteId = String(tokens.athlete?.id || '');
  if (!athleteId) throw new Error('Strava no ha devuelto la identidad del deportista.');
  const other = db.prepare('SELECT user_id FROM strava_connections WHERE athlete_id=?').get(athleteId);
  if (other && other.user_id !== userId) throw new Error('Esta cuenta de Strava ya está vinculada a otro usuario.');
  db.prepare(`INSERT INTO strava_connections (user_id, athlete_id, scopes, access_token, refresh_token, expires_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET athlete_id=excluded.athlete_id,scopes=excluded.scopes,
      access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at`)
    .run(userId, athleteId, scopes, encrypt(tokens.access_token), encrypt(tokens.refresh_token), tokens.expires_at);
  clearStravaCache(userId);
}
async function validAccessToken(userId) {
  const row = db.prepare('SELECT * FROM strava_connections WHERE user_id=?').get(userId);
  if (!row) return null;
  if (row.expires_at > Math.floor(Date.now()/1000) + 300) return decrypt(row.access_token);
  requireStravaConfig();
  const fresh = await stravaToken({ grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token) });
  db.prepare('UPDATE strava_connections SET access_token=?,refresh_token=?,expires_at=? WHERE user_id=?')
    .run(encrypt(fresh.access_token), encrypt(fresh.refresh_token), fresh.expires_at, userId);
  return fresh.access_token;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', (req,res,next) => { res.set('Cache-Control', 'no-store'); next(); });
// Strava llama directamente a Render: la ruta lleva un secreto independiente del token de verificación.
// Nunca consultar la API dentro de la petición del webhook; Strava exige responder en dos segundos.
app.get('/api/strava/webhook/:secret', (req, res) => {
  if (!WEBHOOK_SECRET || !WEBHOOK_VERIFY_TOKEN || !secureTextEquals(req.params.secret, WEBHOOK_SECRET))
    return res.sendStatus(404);
  if (req.query['hub.mode'] !== 'subscribe' ||
      !secureTextEquals(req.query['hub.verify_token'], WEBHOOK_VERIFY_TOKEN) ||
      typeof req.query['hub.challenge'] !== 'string') return res.sendStatus(403);
  return res.json({ 'hub.challenge': req.query['hub.challenge'] });
});
app.post('/api/strava/webhook/:secret', (req, res) => {
  if (!WEBHOOK_SECRET || !secureTextEquals(req.params.secret, WEBHOOK_SECRET)) return res.sendStatus(404);
  const event = parseWebhookEvent(req.body);
  if (!event || (WEBHOOK_SUBSCRIPTION_ID && event.subscriptionId !== WEBHOOK_SUBSCRIPTION_ID))
    return res.sendStatus(200); // no filtrar datos de una cuenta por una petición malformada
  const connection = db.prepare('SELECT user_id FROM strava_connections WHERE athlete_id=?').get(event.ownerId);
  if (!connection) return res.sendStatus(200);
  if (event.objectType === 'athlete' && event.authorized === false) {
    db.prepare('DELETE FROM strava_connections WHERE user_id=?').run(connection.user_id);
  } else if (event.objectType === 'activity') {
    db.prepare(`INSERT INTO strava_events (user_id,last_event_at,last_event_kind) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET last_event_at=MAX(strava_events.last_event_at+1,excluded.last_event_at),
      last_event_kind=excluded.last_event_kind`)
      .run(connection.user_id, Date.now(), `${event.aspectType}:${event.objectId}`);
  }
  clearStravaCache(connection.user_id);
  return res.sendStatus(200);
});

app.use('/api', csrfSameOrigin);
// Endpoint de diagnostico sin datos personales.
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'raceestrategy-api' }));

app.post('/api/auth/register', authRateLimit, async (req,res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: 'Introduce nombre, correo válido y contraseña de 10 a 128 caracteres.' });
  }
  const hashed = await bcrypt.hash(password, 12);
  try {
    const info = db.prepare('INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)').run(name,email,hashed,Date.now());
    createSession(res, info.lastInsertRowid);
    return res.status(201).json({ user: { id: Number(info.lastInsertRowid), name, email } });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});
app.post('/api/auth/login', authRateLimit, async (req,res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  createSession(res, user.id);
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});
app.get('/api/auth/me', account, (req,res) => res.json({ user: req.user }));
app.post('/api/auth/logout', account, (req,res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
  res.clearCookie(COOKIE, { path: '/', sameSite: 'lax', secure: isProduction, httpOnly: true });
  res.json({ ok: true });
});
// La selección del ZIP ocurre en el navegador: SOLO se envía activities.csv al backend.
// El archivo completo no se almacena. Se guardan exclusivamente los campos agregables.
app.get('/api/import/status', account, (req,res) => {
  const info=db.prepare('SELECT * FROM import_info WHERE user_id=?').get(req.user.id);
  const count=db.prepare('SELECT COUNT(*) AS total FROM imported_activities WHERE user_id=?').get(req.user.id).total;
  res.json({ imported:count>0, count, updatedAt:info?.updated_at ? new Date(info.updated_at).toISOString():null,
    skipped:info?.skipped||0, noMovingTime:info?.no_moving_time||0 });
});
app.post('/api/import/strava-csv', account, express.text({type:'text/csv',limit:'20mb'}), (req,res) => {
  if(typeof req.body !== 'string') return res.status(415).json({error:'Selecciona el CSV o el ZIP exportado de Strava.'});
  let parsed;
  try { parsed=parseStravaExport(req.body); }
  catch(e) { return res.status(400).json({error:e.message}); }
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM imported_activities WHERE user_id=?').run(req.user.id);
    const insert=db.prepare(`INSERT INTO imported_activities(user_id,activity_id,name,sport_type,start_date,distance,moving_time,elevation_gain)
      VALUES (?,?,?,?,?,?,?,?)`);
    for(const a of parsed.activities) insert.run(req.user.id,a.id,a.name,a.sport_type,a.start_date,a.distance,a.moving_time,a.total_elevation_gain);
    db.prepare(`INSERT INTO import_info(user_id,updated_at,skipped,no_moving_time) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at,skipped=excluded.skipped,no_moving_time=excluded.no_moving_time`)
      .run(req.user.id,Date.now(),parsed.skipped,parsed.noMovingTime);
  });
  replace();
  return res.json({ok:true,count:parsed.activities.length,skipped:parsed.skipped,noMovingTime:parsed.noMovingTime,
    noMetrics:parsed.noMetrics,skippedByReason:parsed.skippedByReason,
    skippedExamples:parsed.skippedExamples,sourceRows:parsed.sourceRows});
});
app.get('/api/import/overview', account, (req,res) => {
  const rows=db.prepare(`SELECT activity_id AS id, name, sport_type, start_date, distance,moving_time,
    elevation_gain AS total_elevation_gain FROM imported_activities WHERE user_id=? ORDER BY start_date DESC`).all(req.user.id);
  if(!rows.length) return res.status(404).json({error:'Primero debes importar tu historial de Strava.'});
  const firstname=req.user.name.split(/\s+/)[0];
  const lastname=req.user.name.split(/\s+/).slice(1).join(' ');
  const info=db.prepare('SELECT updated_at FROM import_info WHERE user_id=?').get(req.user.id);
  const overview=buildOverview(rows,{firstname,lastname});
  res.json({...overview,limited:false,source:'import',sampleSize:rows.length,
    syncedAt:new Date(info?.updated_at||Date.now()).toISOString(),cached:false});
});
app.delete('/api/import', account, (req,res) => {
  db.transaction(()=>{
    db.prepare('DELETE FROM imported_activities WHERE user_id=?').run(req.user.id);
    db.prepare('DELETE FROM import_info WHERE user_id=?').run(req.user.id);
  })();
  res.json({ok:true});
});
app.get('/api/strava/status', account, (req,res) => {
  const row = db.prepare(`SELECT sc.athlete_id, sc.scopes, se.last_event_at AS last_event_at
    FROM strava_connections sc LEFT JOIN strava_events se ON se.user_id=sc.user_id WHERE sc.user_id=?`).get(req.user.id);
  res.json({ connected: !!row, athleteId: row?.athlete_id ?? null, scopes: row?.scopes ?? null,
    lastEventAt: row?.last_event_at ? new Date(row.last_event_at).toISOString() : null });
});
app.get('/api/strava/connect', account, (req,res) => {
  if (db.prepare('SELECT 1 FROM strava_connections WHERE user_id=?').get(req.user.id)) return res.redirect(`${FRONTEND_URL}/dashboard`);
  try { requireStravaConfig(); }
  catch (e) { return res.status(503).send('La conexión con Strava aún no está configurada en backend/.env'); }
  const state = randomToken();
  db.prepare('INSERT INTO oauth_states(state_hash,user_id,session_hash,expires_at) VALUES (?,?,?,?)')
    .run(digest(state), req.user.id, req.sessionHash, Date.now() + 10 * 60 * 1000);
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: STRAVA_ID, redirect_uri: STRAVA_REDIRECT_URI, response_type: 'code',
    approval_prompt: 'auto', scope: 'read,activity:read', state
  }).toString();
  res.redirect(url.toString());
});
app.get('/api/strava/callback', account, async (req,res) => {
  const redirect = (message) => res.redirect(`${FRONTEND_URL}/dashboard?strava_error=${encodeURIComponent(message)}`);
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const record = state && db.prepare('SELECT * FROM oauth_states WHERE state_hash=?').get(digest(state));
  if (record) db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(digest(state));
  if (!record || record.user_id !== req.user.id || record.session_hash !== req.sessionHash || record.expires_at < Date.now()) return redirect('La autorización ha caducado. Inténtalo de nuevo.');
  if (req.query.error) return redirect('Has cancelado la conexión con Strava.');
  if (typeof req.query.code !== 'string') return redirect('Strava no ha enviado un código de autorización.');
  const scopes = String(req.query.scope || '').replace(/,/g, ' ').split(/\s+/);
  if (!scopes.includes('activity:read') && !scopes.includes('activity:read_all')) return redirect('Debes autorizar la lectura de actividades.');
  try {
    requireStravaConfig();
    const tokens = await stravaToken({ grant_type: 'authorization_code', code: req.query.code });
    saveConnection(req.user.id, tokens, scopes.join(' '));
    return res.redirect(`${FRONTEND_URL}/dashboard?strava_connected=1`);
  } catch (e) { console.error('[OAuth]',e.message); return redirect('No se ha podido completar la conexión. Comprueba la configuración.'); }
});
// Los datos de la API se cachean quince minutos por usuario; la exportación CSV no usa la API.
async function getStravaActivities(userId) {
  const previous = cachedStravaActivities.get(userId);
  if (previous && Date.now() - previous.ts < CACHE_MS) return previous;
  const token = await validAccessToken(userId);
  const headers = { Authorization: `Bearer ${token}` };
  const [athlete, page1, page2] = await Promise.all([
    stravaFetch('https://www.strava.com/api/v3/athlete', { headers }),
    stravaFetch('https://www.strava.com/api/v3/athlete/activities?per_page=100&page=1', { headers }),
    stravaFetch('https://www.strava.com/api/v3/athlete/activities?per_page=100&page=2', { headers })
  ]);
  const entry = { raw: [...page1, ...page2], athlete, ts: Date.now() };
  cachedStravaActivities.set(userId, entry);
  return entry;
}
app.get('/api/strava/overview', account, async (req,res) => {
  if (!db.prepare('SELECT 1 FROM strava_connections WHERE user_id=?').get(req.user.id)) return res.status(404).json({ error: 'Conecta tu cuenta de Strava primero.' });
  const previous = cachedOverview.get(req.user.id);
  if (previous && Date.now() - previous.ts < CACHE_MS) return res.json({ ...previous.value, syncedAt: new Date(previous.ts).toISOString(), cached: true });
  try {
    const { raw, athlete, ts } = await getStravaActivities(req.user.id);
    const value = buildOverview(raw, athlete);
    cachedOverview.set(req.user.id, { value, ts });
    return res.json({ ...value, syncedAt: new Date(ts).toISOString(), cached: true, source: 'api' });
  } catch (e) {
    const { status, message } = publicError(e, 'No pudimos recuperar las actividades de Strava.');
    return res.status(status).json({ error: message });
  }
});

async function activitiesForUser(userId, source) {
  if (source === 'import') {
    const rows = db.prepare(`SELECT activity_id AS id, name, sport_type, start_date, distance, moving_time,
      elevation_gain AS total_elevation_gain FROM imported_activities WHERE user_id=?`).all(userId);
    return rows.map(r => toActivity(r, source));
  }
  if (!db.prepare('SELECT 1 FROM strava_connections WHERE user_id=?').get(userId)) {
    const err = new Error('Conecta tu cuenta de Strava primero.');
    err.status = 404;
    throw err;
  }
  const { raw } = await getStravaActivities(userId);
  return raw.map(a => toActivity(a, source));
}
function sourceFromQuery(req) {
  return req.query.source === 'api' ? 'api' : req.query.source === 'import' ? 'import' : null;
}
// Perfil deportivo: reutiliza los datos de origen seleccionados, sin duplicar información personal.
app.get('/api/profile', account, async (req,res) => {
  const source = sourceFromQuery(req);
  if (!source) return res.status(400).json({ error: 'Indica source=import o source=api.' });
  const sport = typeof req.query.sport === 'string' ? req.query.sport : 'all';
  if (!['all','run','cycle','mtb','hike','other'].includes(sport)) return res.status(400).json({ error: 'Modalidad no válida.' });
  try {
    const activities = await activitiesForUser(req.user.id, source);
    const profile = buildSportProfile(activities, sport);
    res.json({ ...profile, source, limited: source === 'api' && activities.length >= 200 });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    const { status, message } = publicError(e, 'No se pudo calcular el perfil deportivo.');
    return res.status(status).json({ error: message });
  }
});
app.get('/api/activities', account, async (req,res) => {
  const source = sourceFromQuery(req);
  if (!source) return res.status(400).json({ error: 'Indica source=import o source=api.' });
  try {
    const activities = await activitiesForUser(req.user.id, source);
    const listing = listActivities(activities, req.query);
    res.json({ ...listing, source, limited: source === 'api' && activities.length >= 200 });
  } catch(e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    const { status, message } = publicError(e, 'No se pudo cargar el historial deportivo.');
    res.status(status).json({ error: message });
  }
});
app.get('/api/activities/:id', account, async (req,res) => {
  const source = sourceFromQuery(req);
  if (!source) return res.status(400).json({ error: 'Indica source=import o source=api.' });
  if (!/^\d{1,20}$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador de actividad no válido.' });
  try {
    const activities = await activitiesForUser(req.user.id, source);
    const activity = activities.find(a => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: 'No se ha encontrado esa actividad en el origen seleccionado.' });
    res.json({ activity });
  } catch(e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    const { status, message } = publicError(e, 'No se pudo cargar la actividad.');
    res.status(status).json({ error: message });
  }
});
// FC temporal solo de actividades que pertenecen al usuario; no se almacena en SQLite.
app.get('/api/strava/activities/:id/heart-rate', account, async (req,res) => {
  const id = req.params.id;
  if (!/^\d{1,20}$/.test(id)) return res.status(400).json({ error: 'ID de actividad no válido.' });
  if (!db.prepare('SELECT 1 FROM strava_connections WHERE user_id=?').get(req.user.id))
    return res.status(404).json({ error: 'Debes conectar Strava.' });
  try {
    const { raw } = await getStravaActivities(req.user.id);
    if (!raw.some(activity => String(activity.id) === id))
      return res.status(404).json({ error: 'La actividad no pertenece a tu historial consultado.' });
    const cacheKey = `${req.user.id}:${id}`;
    const cached = cachedHeartStreams.get(cacheKey);
    if (cached && Date.now()-cached.ts < CACHE_MS) return res.json(cached.value);
    const token = await validAccessToken(req.user.id);
    const data = await stravaFetch(`https://www.strava.com/api/v3/activities/${id}/streams?keys=time,heartrate&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } });
    const value = sanitizeHeartSeries(data);
    cachedHeartStreams.set(cacheKey, { value, ts: Date.now() });
    return res.json(value);
  } catch(e) {
    const { status, message } = publicError(e, 'No pudimos cargar las pulsaciones de esta actividad.');
    return res.status(status).json({ error: message });
  }
});

app.delete('/api/strava/disconnect', account, async (req,res) => {
  const row = db.prepare('SELECT * FROM strava_connections WHERE user_id=?').get(req.user.id);
  if (!row) return res.json({ ok: true });
  try {
    requireStravaConfig();
    const basic = Buffer.from(`${STRAVA_ID}:${STRAVA_SECRET}`).toString('base64');
    await stravaFetch('https://www.strava.com/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: decrypt(row.refresh_token), token_type_hint: 'refresh_token' })
    });
    db.prepare('DELETE FROM strava_connections WHERE user_id=?').run(req.user.id);
    clearStravaCache(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    const { status, message } = publicError(e, 'Strava no ha confirmado la revocación. Inténtalo otra vez.');
    res.status(status).json({ error: message });
  }
});
app.delete('/api/auth/account', account, async (req,res) => {
  const connection = db.prepare('SELECT refresh_token FROM strava_connections WHERE user_id=?').get(req.user.id);
  if (connection) {
    try {
      requireStravaConfig();
      const basic = Buffer.from(`${STRAVA_ID}:${STRAVA_SECRET}`).toString('base64');
      await stravaFetch('https://www.strava.com/oauth/revoke', {
        method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decrypt(connection.refresh_token), token_type_hint: 'refresh_token' })
      });
    } catch (e) { return res.status(502).json({ error: 'No se pudo revocar la conexión con Strava. Desconéctala primero.' }); }
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
  clearStravaCache(req.user.id);
  res.clearCookie(COOKIE, { path: '/', sameSite: 'lax', secure: isProduction, httpOnly: true });
  res.json({ ok: true });
});
app.post('/api/routes/recommend', account, async (req, res) => {
  const source = sourceFromQuery(req) || 'import';
  const { sport, targetDistance, targetElevation, routeType, startLocation, endLocation } = req.body || {};

  if (!targetDistance || !startLocation) {
    return res.status(400).json({ error: 'Debes indicar al menos la distancia objetivo y el punto de salida.' });
  }

  try {
    // 1. Obtenemos las actividades del usuario (Strava o importadas)
    let activities = [];
    try {
      activities = await activitiesForUser(req.user.id, source);
    } catch {
      // Si falla la fuente solicitada, probamos la otra
      const altSource = source === 'api' ? 'import' : 'api';
      try { activities = await activitiesForUser(req.user.id, altSource); } catch { activities = []; }
    }

    // 2. Ordenamos por fecha descendente para coger las más recientes
    const sorted = [...activities].sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));

    // 3. Llamamos a Gemini
    const recommendation = await recommendRouteWithAI({
      recentActivities: sorted.slice(0, 10),
      targetParams: {
        targetDistance,
        targetElevation,
        routeType,
        startLocation,
      },
    });

    res.json({
      ok: true,
      recommendation,
      usedActivitiesCount: Math.min(sorted.length, 10),
    });
  } catch (error) {
    const { status, message } = publicError(error, 'Error al generar la recomendación de ruta con IA.');
    res.status(status).json({ error: message });
  }
});

// Laboratorio IA (ZIP/CSV/FIT manual): rutas separadas de la recomendación de Gemini.
mountMlOwnedRoutes(app, account, db);
app.use('/api', (_req,res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((err,_req,res,_next) => {
  if(err?.type==='entity.too.large') return res.status(413).json({error:'El CSV supera el límite de 20 MB de esta versión.'});
  console.error('[Server]',err.message); res.status(500).json({error:'Error interno.'});
});

app.listen(PORT, () => console.log(`RaceEstrategy API: http://localhost:${PORT}`));

