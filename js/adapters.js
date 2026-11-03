/* =========================================================================
   Adaptadores de datos. Tres modos REALES:
     · node     → servidor incluido (server/server.js): multiusuario, opiniones
                  públicas, exámenes compartidos y proxy de IA con clave server-side
     · firebase → Realtime Database REST (configurar FIREBASE_DB_URL)
     · local    → navegador, con export/import. Nunca se hace pasar por nube.
   ========================================================================= */
(function (global) {
  'use strict';

  var C = global.ATLAS_CONFIG;
  var S = global.ATLAS.store;
  var mode = 'local';
  var label = 'Modo local (este dispositivo)';
  var health = null;

  function timeoutFetch(url, opts, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 6000);
    if (ctrl) opts = Object.assign({}, opts, { signal: ctrl.signal });
    return fetch(url, opts).finally(function () { clearTimeout(t); });
  }

  function api(path, opts) {
    return timeoutFetch(C.API_BASE + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts || {}), 8000);
  }

  function fbKey(k) { return encodeURIComponent(String(k).replace(/[.#$[\]/]/g, '_')); }
  function fbUrl(path) {
    var u = C.FIREBASE_DB_URL.replace(/\/$/, '') + '/' + path + '.json';
    if (C.FIREBASE_ID_TOKEN) u += '?auth=' + encodeURIComponent(C.FIREBASE_ID_TOKEN);
    return u;
  }
  function fbList(path) {
    return timeoutFetch(fbUrl(path), {}, 8000).then(function (r) {
      if (!r.ok) throw new Error('Firebase respondió ' + r.status);
      return r.json();
    }).then(function (obj) {
      if (!obj || typeof obj !== 'object') return [];
      return Object.keys(obj).map(function (k) { return Object.assign({ id: k }, obj[k]); });
    });
  }
  function fbPush(path, value) {
    return timeoutFetch(fbUrl(path), { method: 'POST', body: JSON.stringify(value) }, 8000)
      .then(function (r) { if (!r.ok) throw new Error('Firebase respondió ' + r.status); return r.json(); });
  }
  function fbPut(path, value) {
    return timeoutFetch(fbUrl(path), { method: 'PUT', body: JSON.stringify(value) }, 8000)
      .then(function (r) { if (!r.ok) throw new Error('Firebase respondió ' + r.status); return r.json(); });
  }

  function detect() {
    /* file:// o BACKEND local: no se intenta /api/health (evita 404/errores de consola). */
    if (C.BACKEND === 'local' || global.location.protocol === 'file:') {
      return Promise.resolve(setMode('local', 'Este dispositivo'));
    }
    if (C.BACKEND === 'firebase' && C.FIREBASE_DB_URL) {
      return fbList('exams').then(function () { return setMode('firebase', 'Firebase · nube compartida'); })
        .catch(function () { return setMode('local', 'Firebase sin configurar → modo local'); });
    }
    if (C.BACKEND === 'firebase') return Promise.resolve(setMode('local', 'Firebase sin configurar → modo local'));
    return api('/health', { method: 'GET' }).then(function (r) {
      if (!r.ok) throw new Error('API no disponible');
      return r.json();
    }).then(function (h) {
      health = h;
      return setMode('node', 'Comunidad compartida');
    }).catch(function () {
      return setMode('local', 'Este dispositivo');
    });
  }

  function setMode(m, l) { mode = m; label = l; return { mode: m, label: l }; }

  function progressSnapshot() {
    var s = S.state;
    return {
      email: s.profile.email,
      name: s.profile.name,
      updatedAt: S.now(),
      totals: {
        notes: s.notes.length,
        sessions: s.sessions.length,
        results: s.results.length
      },
      sessions: s.sessions.slice(-400),
      results: s.results.slice(-300),
      notesMeta: s.notes.map(function (n) { return { id: n.id, subjectId: n.subjectId, title: n.title, updatedAt: n.updatedAt }; }).slice(0, 300)
    };
  }

  var API = {
    get mode() { return mode; },
    get label() { return label; },
    get health() { return health; },
    get isShared() { return mode !== 'local'; },
    get proxyAvailable() { return mode === 'node' && !!(health && health.ai); },
    init: detect,

    /* ---------- exámenes de la comunidad ---------- */
    listExams: function () {
      if (mode === 'node') {
        return api('/exams', { method: 'GET' }).then(function (r) { return r.json(); })
          .then(function (d) { return Array.isArray(d.exams) ? d.exams : []; })
          .catch(function () { return []; });
      }
      if (mode === 'firebase') return fbList('exams').catch(function () { return []; });
      return Promise.resolve(S.state.exams.filter(function (e) { return e.source === 'community' || e.source === 'imported'; }));
    },
    publishExam: function (exam) {
      var clean = S.normalizeExam(exam);
      if (!clean) throw new Error('Examen inválido.');
      if (mode === 'node') {
        return api('/exams', { method: 'POST', body: JSON.stringify(clean) }).then(function (r) {
          if (!r.ok) throw new Error('El servidor rechazó el examen (' + r.status + ')');
          return r.json();
        }).then(function (d) { return d.exam || clean; });
      }
      if (mode === 'firebase') {
        return fbPush('exams', clean).then(function (d) { return Object.assign({}, clean, { id: d.name }); });
      }
      clean.source = 'community';
      S.addExam(clean);
      return Promise.resolve(clean);
    },
    deleteExam: function (id) {
      if (mode === 'node') return api('/exams/' + encodeURIComponent(id), { method: 'DELETE' }).catch(function () {});
      if (mode === 'firebase') return timeoutFetch(fbUrl('exams/' + fbKey(id)), { method: 'DELETE' }, 8000).catch(function () {});
      S.removeExam(id); return Promise.resolve();
    },

    /* ---------- opiniones públicas ---------- */
    listOpinions: function () {
      if (mode === 'node') {
        return api('/opinions', { method: 'GET' }).then(function (r) { return r.json(); })
          .then(function (d) { return Array.isArray(d.opinions) ? d.opinions : []; }).catch(function () { return []; });
      }
      if (mode === 'firebase') return fbList('opinions').catch(function () { return []; });
      return Promise.resolve(S.state.opinions);
    },
    publishOpinion: function (text, author) {
      var o = { text: String(text).slice(0, 1000), author: String(author || 'Anónimo').slice(0, 120), ts: S.now() };
      if (mode === 'node') {
        return api('/opinions', { method: 'POST', body: JSON.stringify(o) }).then(function (r) {
          if (!r.ok) throw new Error('No se pudo publicar (' + r.status + ')');
          return r.json();
        }).then(function (d) { return d.opinion || o; });
      }
      if (mode === 'firebase') return fbPush('opinions', o).then(function (d) { return Object.assign({ id: d.name }, o); });
      var saved = S.addOpinion(o.text, o.author);
      return Promise.resolve(saved);
    },

    /* ---------- progreso vinculado a la cuenta ---------- */
    syncProgress: function () {
      var snap = progressSnapshot();
      if (!snap.email) throw new Error('Primero guarda tu correo de Gmail en Ajustes.');
      if (mode === 'node') {
        return api('/progress', { method: 'POST', body: JSON.stringify(snap) }).then(function (r) {
          if (!r.ok) throw new Error('No se pudo sincronizar (' + r.status + ')');
          return r.json();
        });
      }
      if (mode === 'firebase') return fbPut('progress/' + fbKey(snap.email), snap);
      return Promise.resolve({ mode: 'local', message: 'Guardado en este navegador. Exporta una copia para llevarlo a otro dispositivo.' });
    },
    loadProgress: function () {
      var email = S.state.profile.email;
      if (!email) throw new Error('Primero guarda tu correo de Gmail.');
      if (mode === 'node') {
        return api('/progress?email=' + encodeURIComponent(email), { method: 'GET' }).then(function (r) { return r.json(); });
      }
      if (mode === 'firebase') {
        return timeoutFetch(fbUrl('progress/' + fbKey(email)), {}, 8000).then(function (r) { return r.json(); });
      }
      return Promise.resolve(null);
    },

  };

  global.ATLAS = global.ATLAS || {};
  global.ATLAS.adapters = API;
})(window);
