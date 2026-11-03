/* =========================================================================
   API de A.T.L.A.S para Netlify Functions (y para el servidor de vista previa).
   · La clave de Gemini/OpenAI se lee de variables de entorno: NUNCA viaja al navegador.
   · Exámenes, opiniones y progreso se guardan en Netlify Blobs (persistente
     entre usuarios). Si Blobs no está disponible, usa memoria (útil en local).
   ========================================================================= */

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: HEADERS });

const EMPTY = () => ({ exams: [], opinions: [], progress: {} });
let memory = EMPTY();
let storePromise;

async function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const mod = await import('@netlify/blobs');
        return mod.getStore('atlas');
      } catch (e) {
        return null;
      }
    })();
  }
  return storePromise;
}

async function readDB() {
  const s = await getStore();
  if (s) {
    try {
      const v = await s.get('db', { type: 'json' });
      if (v && typeof v === 'object') {
        return {
          exams: Array.isArray(v.exams) ? v.exams : [],
          opinions: Array.isArray(v.opinions) ? v.opinions : [],
          progress: v.progress && typeof v.progress === 'object' ? v.progress : {}
        };
      }
    } catch (e) { /* cae a memoria */ }
  }
  return memory;
}

async function writeDB(db) {
  memory = db;
  const s = await getStore();
  if (s) { try { await s.set('db', JSON.stringify(db)); } catch (e) {} }
  return db;
}

const str = (v, max = 1000) => typeof v === 'string' ? v.slice(0, max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') : '';
const emailOk = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 180;

function cleanExam(e) {
  const qs = (Array.isArray(e.questions) ? e.questions : []).slice(0, 20).map((q) => {
    const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((o) => str(o, 220));
    let correct = Number(q.correct);
    if (!Number.isFinite(correct)) correct = 0;
    return {
      q: str(q.q, 400), options: opts,
      correct: Math.max(0, Math.min(opts.length - 1, Math.floor(correct))),
      explain: str(q.explain, 600)
    };
  }).filter((q) => q.q && q.options.length >= 2 && q.options.every(Boolean));
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

/* ----------------------------- proxy de IA ----------------------------- */
const GEMINI_FALLBACK = {
  'gemini-3.8-flash': 'gemini-3.5-flash-lite',
  'gemini-3.6-flash': 'gemini-3.5-flash-lite',
  'gemini-4-argon': 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite': 'gemini-3.1-flash-lite'
};

async function callGemini(model, key, payload) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((d.error && d.error.message) || ('Gemini HTTP ' + r.status));
    err.status = r.status;
    throw err;
  }
  const parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
  const texts = parts ? parts.map((p) => p.text || '').filter(Boolean) : [];
  if (!texts.length) throw new Error('El modelo devolvió una respuesta vacía.');
  /* A veces el modelo fragmenta la respuesta en varios parts. Se prefiere el
     fragmento que por sí solo sea JSON válido; si no, se concatenan. */
  for (const t of texts.slice().sort((a, b) => b.length - a.length)) {
    try { JSON.parse(t.trim()); return t; } catch (e) { /* sigue */ }
  }
  return texts.join('');
}

function validJson(text) {
  try { JSON.parse(String(text).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()); return true; }
  catch (e) { return false; }
}

async function aiGenerate(body, request) {
  const provider = str(body.provider, 20);
  const model = str(body.model, 120);
  const system = str(body.system, 12000);
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: str(m.content, 12000)
  }));
  const jsonMode = !!body.json;
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35;
  const maxTokens = Math.min(8000, Math.max(100, Number(body.maxTokens) || 1400));
  const clientKey = str(request.headers.get('x-atlas-key'), 400);

  if (provider === 'gemini') {
    if (!/^gemini-[a-z0-9.\-]+$/i.test(model)) throw new Error('Modelo no válido.');
    const key = clientKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Falta GEMINI_API_KEY en las variables de entorno de Netlify.');
    const gen = { temperature, maxOutputTokens: maxTokens };
    if (jsonMode) gen.responseMimeType = 'application/json';
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: gen
    };
    let usedModel = model;
    let text = '';
    try {
      text = await callGemini(model, key, payload);
    } catch (err) {
      /* Alta demanda o cuota: reintenta con el modelo de respaldo. */
      const fallback = GEMINI_FALLBACK[model] || 'gemini-3.1-flash-lite';
      if (fallback !== model && [404, 429, 500, 503].includes(err.status)) {
        usedModel = fallback;
        text = await callGemini(fallback, key, payload);
      } else throw err;
    }
    /* En modo JSON, si el modelo devolvió texto malformado, reintenta una vez
       con instrucciones más estrictas y temperatura 0. */
    if (jsonMode && !validJson(text)) {
      const strict = Object.assign({}, payload, {
        systemInstruction: { parts: [{ text: 'Devuelve ÚNICAMENTE un objeto JSON válido. Todas las claves y TODOS los valores de texto van entre comillas dobles. No escribas nada fuera del JSON. ' + system }] },
        generationConfig: Object.assign({}, payload.generationConfig, { temperature: 0 })
      });
      try {
        const retry = await callGemini(usedModel, key, strict);
        if (validJson(retry)) text = retry;
      } catch (e) { /* conserva el primer intento */ }
    }
    return { text, provider, model: usedModel };
  }

  if (provider === 'openai') {
    if (!/^[a-z0-9.\-]+$/i.test(model)) throw new Error('Modelo no válido.');
    const key = clientKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Falta OPENAI_API_KEY en las variables de entorno de Netlify.');
    const payload = {
      model, instructions: system,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: maxTokens, temperature
    };
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d.error && d.error.message) || ('OpenAI HTTP ' + r.status));
    let text = typeof d.output_text === 'string' ? d.output_text : '';
    if (!text) (d.output || []).forEach((i) => (i.content || []).forEach((c) => { if (c.type === 'output_text') text += c.text || ''; }));
    if (!text) throw new Error('El modelo devolvió una respuesta vacía.');
    return { text, provider, model };
  }

  throw new Error('Proveedor no soportado.');
}

/* ------------------------------- router -------------------------------- */
export default async function handler(request) {
  const url = new URL(request.url);
  let p = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
  if (!p || p === '/') p = '/health';
  const method = request.method.toUpperCase();

  let body = {};
  if (method === 'POST' || method === 'PUT') {
    try { body = await request.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400); }
  }

  if (p === '/health' && method === 'GET') {
    return json({
      ok: true, app: 'A.T.L.A.S', version: '2.0.0', backend: 'netlify',
      proxy: true, ai: { proxy: true },
      hasServerKeys: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      auth: 'none'
    });
  }

  if (p === '/ai/generate' && method === 'POST') {
    try { return json(await aiGenerate(body, request)); }
    catch (e) { return json({ error: e.message }, 400); }
  }

  if (p === '/exams' && method === 'GET') return json({ exams: (await readDB()).exams.slice(0, 200) });
  if (p === '/exams' && method === 'POST') {
    const exam = cleanExam(body);
    if (!exam) return json({ error: 'Se necesitan al menos 3 preguntas con 4 opciones válidas.' }, 400);
    const db = await readDB();
    db.exams = [exam].concat(db.exams).slice(0, 200);
    await writeDB(db);
    return json({ exam }, 201);
  }
  if (p.startsWith('/exams/') && method === 'DELETE') {
    const id = decodeURIComponent(p.slice('/exams/'.length));
    const db = await readDB();
    db.exams = db.exams.filter((e) => e.id !== id);
    await writeDB(db);
    return json({ ok: true });
  }

  if (p === '/opinions' && method === 'GET') return json({ opinions: (await readDB()).opinions.slice(0, 200) });
  if (p === '/opinions' && method === 'POST') {
    const text = str(body.text, 1000).trim();
    if (!text) return json({ error: 'La opinión no puede estar vacía.' }, 400);
    const opinion = { id: crypto.randomUUID(), text, author: str(body.author, 120) || 'Anónimo', ts: new Date().toISOString() };
    const db = await readDB();
    db.opinions = [opinion].concat(db.opinions).slice(0, 200);
    await writeDB(db);
    return json({ opinion }, 201);
  }

  if (p === '/progress' && method === 'POST') {
    if (!emailOk(body.email)) return json({ error: 'Correo no válido.' }, 400);
    const key = body.email.trim().toLowerCase();
    const db = await readDB();
    db.progress[key] = {
      email: key, name: str(body.name, 120), updatedAt: new Date().toISOString(),
      totals: body.totals && typeof body.totals === 'object' ? body.totals : {},
      sessions: (Array.isArray(body.sessions) ? body.sessions : []).slice(-400),
      results: (Array.isArray(body.results) ? body.results : []).slice(-300),
      notesMeta: (Array.isArray(body.notesMeta) ? body.notesMeta : []).slice(0, 300)
    };
    await writeDB(db);
    return json({ ok: true, email: key });
  }
  if (p === '/progress' && method === 'GET') {
    const email = str(url.searchParams.get('email'), 180).toLowerCase();
    return json((await readDB()).progress[email] || null);
  }

  return json({ error: 'Endpoint no encontrado' }, 404);
}
