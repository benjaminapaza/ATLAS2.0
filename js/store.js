/* =========================================================================
   Capa de datos segura: validación, tolerancia a datos corruptos, cuota,
   migración desde la versión 1 y copias de seguridad.
   ========================================================================= */
(function (global) {
  'use strict';

  var C = global.ATLAS_CONFIG;
  var KEY = C.STORAGE_KEY;
  var listeners = [];

  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function now() { return new Date().toISOString(); }

  function blank() {
    return {
      version: 2,
      migrated: false,
      demo: false,
      theme: 'light',
      profile: { email: '', name: '', google: false, syncedAt: null },
      ai: {
        provider: 'gemini',
        model: '',
        keys: { gemini: '', openai: '', custom: '' },
        customEndpoint: '',
        transport: 'auto' /* auto → proxy si existe; si no, directo; si falla, local */
      },
      notes: [],
      sessions: [],
      results: [],
      exams: [],
      opinions: [],
      chat: { general: [], subjects: {} }
    };
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 4000) : ''; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* Normaliza cualquier objeto (incluido un backup manipulado) al esquema. */
  function normalize(raw) {
    var b = blank();
    if (!isObj(raw)) return b;
    var s = {
      version: 2,
      migrated: !!raw.migrated,
      demo: !!raw.demo,
      theme: ['light', 'dark', 'green', 'violet', 'blue'].indexOf(raw.theme) >= 0 ? raw.theme : 'light',
      profile: {
        email: str(isObj(raw.profile) ? raw.profile.email : '', 180),
        name: str(isObj(raw.profile) ? raw.profile.name : '', 120),
        google: !!(isObj(raw.profile) && raw.profile.google),
        syncedAt: isObj(raw.profile) && typeof raw.profile.syncedAt === 'string' ? raw.profile.syncedAt : null
      },
      ai: {
        provider: ['gemini', 'openai', 'custom'].indexOf(isObj(raw.ai) && raw.ai.provider) >= 0 ? raw.ai.provider : 'gemini',
        model: str(isObj(raw.ai) ? raw.ai.model : '', 120),
        keys: {
          gemini: str(isObj(raw.ai) && isObj(raw.ai.keys) ? raw.ai.keys.gemini : '', 400),
          openai: str(isObj(raw.ai) && isObj(raw.ai.keys) ? raw.ai.keys.openai : '', 400),
          custom: str(isObj(raw.ai) && isObj(raw.ai.keys) ? raw.ai.keys.custom : '', 400)
        },
        customEndpoint: str(isObj(raw.ai) ? raw.ai.customEndpoint : '', 400),
        transport: isObj(raw.ai) && raw.ai.transport === 'direct' ? 'direct' : 'auto'
      },
      notes: [], sessions: [], results: [], exams: [], opinions: [],
      chat: { general: [], subjects: {} }
    };

    s.notes = arr(raw.notes).slice(0, C.LIMITS.maxNotes).map(function (n) {
      return {
        id: str(n && n.id, 80) || uid(),
        subjectId: str(n && n.subjectId, 60) || 'general',
        title: str(n && n.title, C.LIMITS.maxTitle) || 'Sin título',
        content: str(n && n.content, C.LIMITS.maxText),
        createdAt: typeof n.createdAt === 'string' ? n.createdAt : now(),
        updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : now()
      };
    });

    s.sessions = arr(raw.sessions).slice(-2000).map(function (x) {
      var m = Number(x && x.minutes);
      return {
        id: str(x && x.id, 80) || uid(),
        ts: typeof x.ts === 'string' ? x.ts : now(),
        minutes: isFinite(m) ? Math.max(0, Math.min(600, m)) : 0,
        subjectId: str(x && x.subjectId, 60),
        kind: str(x && x.kind, 30) || 'manual'
      };
    });

    s.results = arr(raw.results).slice(-1000).map(function (x) {
      var t = Number(x && x.total), c = Number(x && x.correct);
      return {
        id: str(x && x.id, 80) || uid(),
        ts: typeof x.ts === 'string' ? x.ts : now(),
        examId: str(x && x.examId, 80),
        subjectId: str(x && x.subjectId, 60),
        correct: isFinite(c) ? Math.max(0, c) : 0,
        total: isFinite(t) ? Math.max(1, t) : 1,
        source: str(x && x.source, 20) || 'ai'
      };
    });

    s.exams = arr(raw.exams).slice(0, C.LIMITS.maxExams).map(normalizeExam);
    s.exams = s.exams.filter(Boolean);

    s.opinions = arr(raw.opinions).slice(0, C.LIMITS.maxOpinions).map(function (o) {
      return {
        id: str(o && o.id, 80) || uid(),
        text: str(o && o.text, 1000),
        author: str(o && o.author, 120) || 'Anónimo',
        ts: typeof o.ts === 'string' ? o.ts : now()
      };
    }).filter(function (o) { return o.text; });

    if (isObj(raw.chat)) {
      s.chat.general = normalizeMessages(raw.chat.general);
      if (isObj(raw.chat.subjects)) {
        Object.keys(raw.chat.subjects).slice(0, 30).forEach(function (k) {
          s.chat.subjects[str(k, 60)] = normalizeMessages(raw.chat.subjects[k]);
        });
      }
    }
    return s;
  }

  function normalizeMessages(list) {
    return arr(list).slice(-60).map(function (m) {
      return {
        role: m && m.role === 'user' ? 'user' : 'ai',
        text: str(m && m.text, C.LIMITS.maxText),
        ts: typeof m.ts === 'string' ? m.ts : now(),
        engine: str(m && m.engine, 30) || 'local'
      };
    }).filter(function (m) { return m.text; });
  }

  function normalizeExam(e) {
    if (!isObj(e)) return null;
    var qs = arr(e.questions).slice(0, C.LIMITS.maxQuestions).map(function (q) {
      var opts = arr(q && q.options).slice(0, 6).map(function (o) { return str(o, C.LIMITS.maxOption); });
      var correct = Number(q && q.correct);
      return {
        q: str(q && (q.q || q.pregunta), C.LIMITS.maxQuestion),
        options: opts,
        correct: isFinite(correct) ? Math.max(0, Math.min(opts.length - 1, correct)) : 0,
        explain: str(q && (q.explain || q.explicacion), 600)
      };
    }).filter(function (q) { return q.q && q.options.length >= 2; });
    if (!qs.length) return null;
    return {
      id: str(e.id, 80) || uid(),
      title: str(e.title || e.titulo, C.LIMITS.maxTitle) || 'Examen sin título',
      subjectId: str(e.subjectId || e.materia, 60) || 'general',
      author: str(e.author || e.autor, 120) || 'Anónimo',
      source: ['ai', 'local', 'community', 'imported'].indexOf(e.source) >= 0 ? e.source : 'community',
      model: str(e.model, 80),
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : now(),
      questions: qs
    };
  }

  /* ---------- migración desde la v1 ---------- */
  function legacyRead(key) {
    try { var v = global.localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }

  function migrate(state) {
    if (state.migrated) return state;
    var changed = false;
    var L = C.LEGACY_KEYS;
    var oldNotes = legacyRead(L.notes);
    if (Array.isArray(oldNotes) && oldNotes.length) {
      oldNotes.forEach(function (n) {
        state.notes.push({
          id: String(n.id || uid()), subjectId: 'general',
          title: str(n.titulo || n.title, C.LIMITS.maxTitle) || 'Apunte migrado',
          content: str(n.contenido || n.content, C.LIMITS.maxText),
          createdAt: now(), updatedAt: str(n.fecha, 60) || now()
        });
      });
      changed = true;
    }
    var oldUser = legacyRead(L.user);
    if (isObj(oldUser)) {
      state.profile.name = str(oldUser.nombre, 120);
      state.profile.email = str(oldUser.email, 180);
      changed = true;
    }
    var oldOpinions = legacyRead(L.opinions);
    if (Array.isArray(oldOpinions)) {
      oldOpinions.forEach(function (o) {
        state.opinions.push({ id: uid(), text: str(o.texto, 1000), author: state.profile.name || 'Anónimo', ts: now() });
      });
      changed = true;
    }
    var oldExams = legacyRead(L.exams);
    if (Array.isArray(oldExams)) {
      oldExams.forEach(function (e) {
        var normalized = normalizeExam({
          id: e.id, title: e.titulo, subjectId: e.materia, author: e.autor,
          source: 'community', createdAt: e.fecha || now(),
          questions: arr(e.preguntas).map(function (q) {
            return { q: q.pregunta, options: q.opciones, correct: q.correcta, explain: '' };
          })
        });
        if (normalized) state.exams.push(normalized);
      });
      changed = true;
    }
    var oldTheme = null;
    try { oldTheme = global.localStorage.getItem(L.theme); } catch (e) {}
    if (oldTheme === 'dark') { state.theme = 'dark'; changed = true; }
    state.migrated = true;
    state.__migrationChanges = changed;
    return state;
  }

  function stripDemo() {
    ['notes', 'sessions', 'results', 'exams', 'opinions'].forEach(function (k) {
      state[k] = state[k].filter(function (x) { return String(x.id).indexOf('demo-') !== 0; });
    });
    if (state.chat && Array.isArray(state.chat.general)) {
      state.chat.general = state.chat.general.filter(function (m) { return !m.demo; });
    }
  }

  /* ---------- API pública ---------- */
  var state;
  function load() {
    var raw = null;
    try { raw = JSON.parse(global.localStorage.getItem(KEY)); }
    catch (e) { raw = null; } /* dato corrupto → estado limpio, sin excepciones */
    state = normalize(raw);
    migrate(state);
    return state;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.name === 'QuotaExceededError'
        ? 'Almacenamiento lleno: borra apuntes antiguos o exporta una copia.'
        : 'No se pudo guardar en este navegador.' };
    }
  }

  function commit() {
    var r = save();
    if (!r.ok && global.ATLAS && global.ATLAS.ui) global.ATLAS.ui.toast(r.error, 'err');
    listeners.forEach(function (fn) { try { fn(state); } catch (e) {} });
    return r;
  }

  var API = {
    uid: uid, now: now, normalizeExam: normalizeExam,
    get state() { return state; },
    load: load,
    save: commit,
    update: function (fn) { fn(state); return commit(); },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    setTheme: function (t) { state.theme = t; document.documentElement.setAttribute('data-theme', t); commit(); },
    download: function (filename, text, mime) {
      try {
        var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return true;
      } catch (e) { return false; }
    },
    exportBackup: function () {
      var payload = { app: 'A.T.L.A.S', version: 2, exportedAt: now(), data: state };
      return JSON.stringify(payload, null, 2);
    },
    exportNotesText: function () {
      var lines = ['=========================================', '        APUNTES · A.T.L.A.S v2', '=========================================', ''];
      state.notes.forEach(function (n, i) {
        lines.push('--- APUNTE ' + (i + 1) + ': ' + n.title + ' ---');
        lines.push('Materia: ' + n.subjectId + ' · Actualizado: ' + n.updatedAt);
        lines.push('', n.content, '', '-----------------------------------------', '');
      });
      if (!state.notes.length) lines.push('No hay apuntes guardados.', '');
      return lines.join('\n');
    },
    importBackup: function (obj) {
      if (!isObj(obj) || !isObj(obj.data)) throw new Error('El archivo no es una copia de A.T.L.A.S válida.');
      var incoming = normalize(obj.data);
      /* Fusión conservadora: nunca borra lo que ya existe. */
      ['notes', 'sessions', 'results', 'exams', 'opinions'].forEach(function (k) {
        var seen = {};
        state[k].forEach(function (x) { seen[x.id] = true; });
        incoming[k].forEach(function (x) { if (!seen[x.id]) state[k].push(x); });
      });
      if (incoming.profile.email && !state.profile.email) state.profile.email = incoming.profile.email;
      commit();
      return { notes: incoming.notes.length, exams: incoming.exams.length };
    },
    addNote: function (subjectId) {
      var n = { id: uid(), subjectId: subjectId || 'general', title: 'Nuevo apunte', content: '', createdAt: now(), updatedAt: now() };
      state.notes.unshift(n); commit(); return n;
    },
    deleteNote: function (id) { state.notes = state.notes.filter(function (n) { return n.id !== id; }); commit(); },
    addSession: function (minutes, subjectId, kind) {
      if (!(minutes > 0)) return null;
      var s = { id: uid(), ts: now(), minutes: Math.min(600, Math.round(minutes * 10) / 10), subjectId: subjectId || '', kind: kind || 'manual' };
      state.sessions.push(s); commit(); return s;
    },
    addResult: function (r) {
      var item = {
        id: uid(), ts: now(), examId: r.examId || '', subjectId: r.subjectId || '',
        correct: r.correct, total: r.total, source: r.source || 'ai'
      };
      state.results.push(item); commit(); return item;
    },
    addExam: function (e) {
      var normalized = normalizeExam(e);
      if (!normalized) throw new Error('El examen no tiene preguntas válidas.');
      state.exams.unshift(normalized);
      if (state.exams.length > C.LIMITS.maxExams) state.exams.length = C.LIMITS.maxExams;
      commit(); return normalized;
    },
    removeExam: function (id) { state.exams = state.exams.filter(function (e) { return e.id !== id; }); commit(); },
    addOpinion: function (text, author) {
      var o = { id: uid(), text: String(text).slice(0, 1000), author: String(author || 'Anónimo').slice(0, 120), ts: now() };
      state.opinions.unshift(o); commit(); return o;
    },
    pushMessage: function (scope, key, msg) {
      var list = scope === 'subject' ? (state.chat.subjects[key] = state.chat.subjects[key] || []) : state.chat.general;
      list.push({ role: msg.role, text: String(msg.text).slice(0, C.LIMITS.maxText), ts: now(), engine: msg.engine || 'local' });
      if (list.length > 60) list.splice(0, list.length - 60);
      commit();
    },
    clearChat: function (scope, key) {
      if (scope === 'subject') state.chat.subjects[key] = [];
      else state.chat.general = [];
      commit();
    },
    /* ---------- modo demostración (datos de ejemplo, SIEMPRE etiquetado) ---------- */
    loadDemo: function () {
      stripDemo();
      function day(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
      var sessions = [
        [6, 35, 'anatomia1'], [5, 50, 'anatomia1'], [4, 25, 'histologia1'],
        [3, 60, 'anatomia1'], [2, 45, 'bioestadistica'], [1, 40, 'anatomia1'], [0, 20, 'embriologia']
      ];
      sessions.forEach(function (s, i) {
        state.sessions.push({ id: 'demo-s' + i, ts: day(s[0]), minutes: s[1], subjectId: s[2], kind: 'timer' });
      });
      [
        ['Osteología del miembro superior', 'anatomia1', 'El miembro superior se divide en cinturón escapular, brazo, antebrazo y mano. Huesos clave: escápula, clavícula, húmero, radio, cúbito y carpianos.'],
        ['Miología del hombro', 'anatomia1', 'El manguito rotador lo forman supraespinoso, infraespinoso, redondo menor y subescapular. El deltoides es el motor principal de la abducción.'],
        ['Tejido epitelial', 'histologia1', 'El epitelio se clasifica por número de capas y forma celular. Carece de vasos sanguíneos y se nutre por difusión desde el tejido conectivo subyacente.'],
        ['Media, mediana y moda', 'bioestadistica', 'La media es sensible a valores extremos; la mediana es robusta. En distribuciones simétricas coinciden. La moda es el valor más frecuente.'],
        ['Gastrulación', 'embriologia', 'Durante la tercera semana se forman las tres capas germinativas: ectodermo, mesodermo y endodermo, a partir del epiblasto.']
      ].forEach(function (n, i) {
        state.notes.push({ id: 'demo-n' + i, subjectId: n[1], title: n[0], content: n[2], createdAt: day(5 - i), updatedAt: day(i) });
      });
      [[6, 6, 10], [4, 8, 10], [2, 9, 10], [1, 10, 10]].forEach(function (r, i) {
        state.results.push({ id: 'demo-r' + i, ts: day(r[0]), examId: 'demo-e0', subjectId: 'anatomia1', correct: r[1], total: r[2], source: 'local' });
      });
      state.exams.push({
        id: 'demo-e0', title: 'Simulacro de muestra · Anatomía 1', subjectId: 'anatomia1',
        author: 'Datos de demostración', source: 'local', model: '', createdAt: day(5),
        questions: [
          { q: '¿Cuántos huesos forman el carpo?', options: ['8', '5', '12', '7'], correct: 0, explain: 'El carpo tiene 8 huesos en dos filas de 4.' },
          { q: '¿Qué articulación une la escápula con el húmero?', options: ['Glenohumeral', 'Acromioclavicular', 'Esternoclavicular', 'Radiocarpiana'], correct: 0, explain: 'La articulación glenohumeral es la del hombro.' },
          { q: 'El nervio radial inerva principalmente…', options: ['Extensores del antebrazo', 'Flexores de la mano', 'Músculos intrínsecos', 'Diafragma'], correct: 0, explain: 'El radial inerva los músculos extensores.' },
          { q: '¿Cuál es el hueso más pequeño del cuerpo?', options: ['Estribo', 'Hueso pisiforme', 'Falange distal', 'Vómer'], correct: 0, explain: 'El estribo, en el oído medio, mide unos 3 mm.' },
          { q: 'La clavícula se articula medialmente con…', options: ['Esternón', 'Escápula', 'Húmero', 'Primera costilla'], correct: 0, explain: 'Articulación esternoclavicular.' }
        ]
      });
      [
        ['La sección de progreso me ayuda a saber cuándo descansar.', 'Estudiante de prueba'],
        ['Los simulacros con explicación son lo más útil.', 'Estudiante de prueba 2']
      ].forEach(function (o, i) {
        state.opinions.push({ id: 'demo-o' + i, text: o[0], author: o[1], ts: day(i + 1) });
      });
      state.demo = true;
      commit();
      return { sessions: sessions.length, notes: 5, results: 4, exams: 1, opinions: 2 };
    },
    clearDemo: function () { stripDemo(); state.demo = false; commit(); },
    reset: function () { state = blank(); commit(); }
  };

  state = load();
  global.ATLAS = global.ATLAS || {};
  global.ATLAS.store = API;
})(window);
