#!/usr/bin/env node
/* =========================================================================
   A.T.L.A.S — servidor sin dependencias (Node 18+)
   · Sirve la app estática
   · API real: exámenes y opiniones compartidas, progreso por cuenta
   · Proxy de IA: la clave vive en variables de entorno o en la petición BYOK
   · Verificación real de Google ID tokens vía tokeninfo
   Arranque:  npm start     (o: GEMINI_API_KEY=xxx npm start)
   ========================================================================= */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOW_CUSTOM_ENDPOINT = process.env.ALLOW_CUSTOM_ENDPOINT === '1';
const MAX_BODY = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2'
};

/* ---------------- almacenamiento ---------------- */
let DB = { exams: [], opinions: [], progress: {} };
let writeChain = Promise.resolve();

function normalizeDb(raw) {
  const d = { exams: Array.isArray(raw.exams) ? raw.exams : [], opinions: Array.isArray(raw.opinions) ? raw.opinions : [], progress: {} };
  if (raw.progress && typeof raw.progress === 'object') d.progress = raw.progress;
  return d;
}

async function loadDb() {
  try {
    DB = normalizeDb(JSON.parse(await fsp.readFile(DATA_FILE, 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      try { await fsp.rename(DATA_FILE, DATA_FILE + '.corrupt-' + Date.now()); } catch (_) {}
      console.warn('data.json estaba corrupto; se inició una base limpia (copia conservada).');
    }
    DB = { exams: [], opinions: [], progress: {} };
  }
}

function persist() {
  writeChain = writeChain.then(async () => {
    const tmp = DATA_FILE + '.tmp-' + process.pid;
    await fsp.writeFile(tmp, JSON.stringify(DB, null, 2), 'utf8');
    await fsp.rename(tmp, DATA_FILE);
  }).catch(function (e) { console.error('Error guardando datos:', e.message); });
  return writeChain;
}

/* ---------------- utilidades ---------------- */
function send(res, status, body, headers) {
  const out = Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store'
  }, headers || {});
  res.writeHead(status, out);
  res.end(body);
}
function json(res, status, obj) { send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' }); }

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 1000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') : ''; }
function emailOk(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 180; }

function cleanExam(e) {
  const qs = (Array.isArray(e.questions) ? e.questions : []).slice(0, 20).map(function (q) {
    const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map(function (o) { return str(o, 220); });
    let correct = Number(q.correct);
    if (!Number.isFinite(correct)) correct = 0;
    return {
      q: str(q.q, 400), options: opts,
      correct: Math.max(0, Math.min(opts.length - 1, Math.floor(correct))),
      explain: str(q.explain, 600)
    };
  }).filter(function (q) { return q.q && q.options.length >= 2 && q.options.every(Boolean); });
  if (qs.length < 3) return null;
  return {
    id: str(e.id, 80) || crypto.randomUUID(),
    title: str(e.title, 120) || 'Examen sin título',
    subjectId: str(e.subjectId, 60) || 'general',
    author: str(e.author, 120) || 'Anónimo',
    source: 'community', model: str(e.model, 80),
    createdAt: new Date().toISOString(),
    questions: qs
  };
}

/* Rate limiting sencillo en memoria */
const buckets = new Map();
function rateLimit(req, limit, windowMs, scope) {
  const key = (req.socket.remoteAddress || 'unknown') + ':' + (scope || 'api');
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count++;
  buckets.set(key, b);
  return b.count <= limit;
}

/* ---------------- proxy de IA ---------------- */
async function aiGenerate(body, req) {
  const provider = str(body.provider, 20);
  const model = str(body.model, 120);
  const system = str(body.system, 12000);
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: str(m.content, 12000) };
  });
  const jsonMode = !!body.json;
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35;
  const maxTokens = Math.min(8000, Math.max(100, Number(body.maxTokens) || 1400));
  const clientKey = str(req.headers['x-atlas-key'], 400);

  const jsonHeaders = { 'Content-Type': 'application/json' };
  const opts = (headers, payload) => ({ method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });

  if (provider === 'gemini') {
    if (!/^gemini-[a-z0-9.\-]+$/i.test(model)) throw new Error('Modelo Gemini no válido.');
    const key = clientKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Falta la clave: define GEMINI_API_KEY en el servidor o pega tu clave en Ajustes.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const gen = { temperature, maxOutputTokens: maxTokens };
    if (jsonMode) gen.responseMimeType = 'application/json';
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; }),
      generationConfig: gen
    };
    const r = await fetch(url, opts(Object.assign({ 'x-goog-api-key': key }, jsonHeaders), payload));
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error((d.error && d.error.message) || ('Gemini HTTP ' + r.status));
    const parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    const text = parts ? parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) throw new Error('Gemini devolvió una respuesta vacía.');
    return { text, provider, model };
  }

  if (provider === 'openai') {
    if (!/^[a-z0-9.\-]+$/i.test(model)) throw new Error('Modelo OpenAI no válido.');
    const key = clientKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Falta la clave: define OPENAI_API_KEY en el servidor o pega tu clave en Ajustes.');
    const payload = {
      model, instructions: system,
      input: messages.map(function (m) { return { role: m.role, content: m.content }; }),
      max_output_tokens: maxTokens
    };
    if (Number.isFinite(temperature)) payload.temperature = temperature;
    const r = await fetch('https://api.openai.com/v1/responses', opts(Object.assign({ Authorization: 'Bearer ' + key }, jsonHeaders), payload));
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error((d.error && d.error.message) || ('OpenAI HTTP ' + r.status));
    let text = typeof d.output_text === 'string' ? d.output_text : '';
    if (!text) (d.output || []).forEach(function (i) { (i.content || []).forEach(function (c) { if (c.type === 'output_text') text += c.text || ''; }); });
    if (!text) throw new Error('OpenAI devolvió una respuesta vacía.');
    return { text, provider, model };
  }

  if (provider === 'custom') {
    if (!ALLOW_CUSTOM_ENDPOINT) throw new Error('Los endpoints personalizados están desactivados en el servidor (ALLOW_CUSTOM_ENDPOINT=1 para habilitarlos).');
    const endpoint = str(body.endpoint, 400);
    if (!/^https?:\/\//.test(endpoint)) throw new Error('Endpoint personalizado no válido.');
    const key = clientKey || process.env.CUSTOM_API_KEY || '';
    const headers = Object.assign({}, jsonHeaders);
    if (key) headers.Authorization = 'Bearer ' + key;
    const payload = {
      model, messages: [{ role: 'system', content: system }].concat(messages.map(function (m) { return { role: m.role, content: m.content }; })),
      temperature, max_tokens: maxTokens
    };
    const r = await fetch(endpoint, opts(headers, payload));
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error((d.error && d.error.message) || ('Endpoint HTTP ' + r.status));
    const text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!text) throw new Error('El endpoint no devolvió texto.');
    return { text, provider, model };
  }
  throw new Error('Proveedor no soportado.');
}

/* ---------------- Google ID token ---------------- */
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID no está configurado en el servidor.');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(str(credential, 4096));
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const d = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error((d.error_description || d.error || 'Token rechazado por Google'));
  if (d.aud !== GOOGLE_CLIENT_ID) throw new Error('El token no pertenece a esta aplicación.');
  if (d.email_verified !== 'true' && d.email_verified !== true) throw new Error('El correo de Google no está verificado.');
  return { email: str(d.email, 180), name: str(d.name, 120) };
}

/* ---------------- archivos estáticos ---------------- */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    return send(res, 403, 'Prohibido');
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      /* SPA: cualquier ruta desconocida sirve el index (el router usa hash). */
      return fs.readFile(path.join(ROOT, 'index.html'), function (e, buf) {
        if (e) return send(res, 404, 'No encontrado');
        send(res, 200, buf, { 'Content-Type': MIME['.html'] });
      });
    }
    fs.readFile(file, function (e, buf) {
      if (e) return send(res, 500, 'Error de lectura');
      const ext = path.extname(file).toLowerCase();
      const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
      send(res, 200, buf, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    });
  });
}

/* ---------------- router de API ---------------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const isAI = p === '/api/ai/generate';
  if (!rateLimit(req, isAI ? 30 : 240, 60000, isAI ? 'ai' : 'api')) return json(res, 429, { error: 'Demasiadas peticiones. Espera un minuto.' });

  if (p === '/api/health' && method === 'GET') {
    return json(res, 200, {
      ok: true, app: 'A.T.L.A.S', version: '2.0.0',
      proxy: true, ai: { proxy: true },
      hasServerKeys: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      auth: GOOGLE_CLIENT_ID ? 'google' : 'email',
      backend: 'node'
    });
  }

  if (p === '/api/ai/generate' && method === 'POST') {
    const body = await readBody(req);
    try { return json(res, 200, await aiGenerate(body, req)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (p === '/api/exams' && method === 'GET') return json(res, 200, { exams: DB.exams.slice(0, 200) });
  if (p === '/api/exams' && method === 'POST') {
    const exam = cleanExam(await readBody(req));
    if (!exam) return json(res, 400, { error: 'Se necesitan al menos 3 preguntas con 4 opciones válidas.' });
    DB.exams.unshift(exam);
    if (DB.exams.length > 200) DB.exams.length = 200;
    await persist();
    return json(res, 201, { exam });
  }
  if (p.startsWith('/api/exams/') && method === 'DELETE') {
    const id = decodeURIComponent(p.slice('/api/exams/'.length));
    DB.exams = DB.exams.filter(function (e) { return e.id !== id; });
    await persist();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/opinions' && method === 'GET') return json(res, 200, { opinions: DB.opinions.slice(0, 200) });
  if (p === '/api/opinions' && method === 'POST') {
    const b = await readBody(req);
    const text = str(b.text, 1000).trim();
    if (!text) return json(res, 400, { error: 'La opinión no puede estar vacía.' });
    const opinion = { id: crypto.randomUUID(), text, author: str(b.author, 120) || 'Anónimo', ts: new Date().toISOString() };
    DB.opinions.unshift(opinion);
    if (DB.opinions.length > 200) DB.opinions.length = 200;
    await persist();
    return json(res, 201, { opinion });
  }

  if (p === '/api/progress' && method === 'POST') {
    const b = await readBody(req);
    if (!emailOk(b.email)) return json(res, 400, { error: 'Correo no válido.' });
    const key = b.email.trim().toLowerCase();
    DB.progress[key] = {
      email: key, name: str(b.name, 120), updatedAt: new Date().toISOString(),
      totals: b.totals && typeof b.totals === 'object' ? b.totals : {},
      sessions: (Array.isArray(b.sessions) ? b.sessions : []).slice(-400),
      results: (Array.isArray(b.results) ? b.results : []).slice(-300),
      notesMeta: (Array.isArray(b.notesMeta) ? b.notesMeta : []).slice(0, 300)
    };
    await persist();
    return json(res, 200, { ok: true, email: key });
  }
  if (p === '/api/progress' && method === 'GET') {
    const email = str(url.searchParams.get('email'), 180).toLowerCase();
    return json(res, 200, DB.progress[email] || null);
  }

  if (p === '/api/auth/google' && method === 'POST') {
    const b = await readBody(req);
    try { return json(res, 200, await verifyGoogle(b.credential)); }
    catch (e) { return json(res, 401, { error: e.message }); }
  }

  return json(res, 404, { error: 'Endpoint no encontrado' });
}

/* ---------------- servidor ---------------- */
const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(function (e) {
      json(res, 500, { error: e.message || 'Error interno' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
  serveStatic(req, res, url.pathname);
});

loadDb().then(function () {
  server.listen(PORT, HOST, function () {
    console.log('A.T.L.A.S v2 listo en http://' + HOST + ':' + PORT);
    console.log('  Datos:      ' + DATA_FILE);
    console.log('  IA proxy:   ' + (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY ? 'clave de servidor configurada' : 'sin clave de servidor (usa BYOK en Ajustes)'));
    console.log('  Google:     ' + (GOOGLE_CLIENT_ID ? 'Client ID configurado' : 'no configurado (correo como identificador)'));
  });
});
