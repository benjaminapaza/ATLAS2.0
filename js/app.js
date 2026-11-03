/* =========================================================================
   A.T.L.A.S — Núcleo de la aplicación, router y vistas principales.
   Las vistas de Progreso / Ajustes / Exámenes se registran en views2.js.
   ========================================================================= */
(function (global) {
  'use strict';

  var C = global.ATLAS_CONFIG;
  var S = global.ATLAS.store;
  var A = global.ATLAS.adapters;
  var D = global.ATLAS.data;
  var ui = global.ATLAS.ui;
  var ai = global.ATLAS.ai;
  var P = global.ATLAS.progress;

  var el = ui.el, icon = ui.icon;
  var viewRoot, navRoot;
  var views = {};
  var NAV = [
    { path: '/inicio', label: 'Inicio', icon: 'i-home' },
    { path: '/apuntes', label: 'Apuntes', icon: 'i-book' },
    { path: '/progreso', label: 'Progreso', icon: 'i-chart' },
    { path: '/ajustes', label: 'Ajustes', icon: 'i-gear' }
  ];
  var THEMES = [
    { id: 'light', label: 'Claro', colors: ['#f5f7fc', '#4f46e5', '#ffffff'] },
    { id: 'dark', label: 'Oscuro', colors: ['#080e1b', '#a3b0ff', '#121d31'] },
    { id: 'green', label: 'Verde', colors: ['#f1faf4', '#047857', '#ffffff'] },
    { id: 'violet', label: 'Violeta', colors: ['#f8f5ff', '#6425c7', '#ffffff'] },
    { id: 'blue', label: 'Azul', colors: ['#f1f8ff', '#1552c9', '#ffffff'] }
  ];

  function parseHash() {
    var raw = (location.hash || '#/inicio').slice(1);
    var q = raw.indexOf('?');
    var path = q >= 0 ? raw.slice(0, q) : raw;
    var params = {};
    if (q >= 0) new URLSearchParams(raw.slice(q + 1)).forEach(function (v, k) { params[k] = v; });
    return { path: path || '/inicio', params: params };
  }
  function go(path) { location.hash = '#' + path; }
  function register(name, fn) { views[name] = fn; }

  /* ---------- cabecera y estado global ---------- */
  function renderNav(activePath) {
    ui.mount(navRoot, NAV.map(function (n) {
      var active = activePath === n.path || (n.path === '/apuntes' && activePath.indexOf('/materia/') === 0);
      return el('a', { class: 'nav-link' + (active ? ' active' : ''), href: '#' + n.path, 'aria-current': active ? 'page' : null },
        [icon(n.icon), el('span', { text: n.label })]);
    }));
  }

  function refreshHeader() {
    var st = ai.status();
    var badge = document.getElementById('ai-status');
    if (badge) {
      badge.textContent = st.real ? 'IA activa' : 'Asistente';
      badge.className = 'ai-status' + (st.real ? ' online' : '');
      badge.title = st.real ? ('Modelo: ' + st.model) : 'Asistente de estudio';
    }
    var av = document.getElementById('avatar');
    var email = S.state.profile.email;
    if (av) { av.textContent = email ? email.charAt(0) : '?'; av.title = email || 'Sin cuenta configurada'; }
    var fs = document.getElementById('footer-status');
    if (fs) fs.textContent = 'A.T.L.A.S v' + C.VERSION + ' · Edición Adaptativa';
    var qt = document.getElementById('quick-theme');
    if (qt) {
      ui.clear(qt);
      qt.appendChild(icon(S.state.theme === 'dark' ? 'i-sun' : 'i-moon'));
    }
  }

  function refreshAI() {
    var hasAnyKey = Object.keys(S.state.ai.keys).some(function (k) { return !!(S.state.ai.keys[k] || '').trim(); });
    var serverKeys = !!(A.health && A.health.hasServerKeys);
    ai.setProxyAvailable(A.proxyAvailable && (serverKeys || hasAnyKey));
    refreshHeader();
  }

  function cycleTheme() {
    var ids = THEMES.map(function (t) { return t.id; });
    var i = ids.indexOf(S.state.theme);
    S.setTheme(ids[(i + 1) % ids.length]);
    refreshHeader();
    ui.toast('Tema: ' + THEMES[(i + 1) % ids.length].label, 'ok', 1800);
  }

  /* ---------- componentes reutilizables ---------- */
  function pageHeader(o) {
    if (o.noTitle) {
      return el('div', { class: 'row', style: { marginBottom: '1.25rem', alignItems: 'center' } }, [
        o.back ? el('a', { class: 'btn btn-sm btn-ghost', href: '#' + o.back }, [icon('i-back'), el('span', { text: 'Volver' })]) : null,
        el('span', { class: 'spacer' }), o.action || null
      ]);
    }
    return el('div', { class: 'row', style: { marginBottom: '1.25rem', alignItems: 'flex-start' } }, [
      o.back ? el('a', { class: 'btn btn-sm btn-ghost', href: '#' + o.back }, [icon('i-back'), el('span', { text: 'Volver' })]) : null,
      el('div', { class: 'col', style: { gap: '.2rem', flex: '1 1 12rem' } }, [
        el('span', { class: 'eyebrow', text: o.eyebrow || '' }),
        el('h1', { text: o.title }),
        o.sub ? el('p', { class: 'muted small', text: o.sub }) : null
      ]),
      o.action || null
    ]);
  }

  function sectionTitle(text, action) {
    return el('div', { class: 'section-head' }, [el('div', {}, [el('span', { class: 'eyebrow', text: 'A.T.L.A.S' }), el('h2', { text })]), action || null]);
  }

  function subjectSelect(value, onChange, includeGeneral) {
    var select = el('select', { class: 'select', 'aria-label': 'Filtrar por materia' });
    if (includeGeneral) select.appendChild(el('option', { value: 'general', text: 'General / sin materia' }));
    select.appendChild(el('option', { value: 'all', text: 'Todas las materias' }));
    [1, 2].forEach(function (n) {
      var group = el('optgroup', { label: n === 1 ? 'Primer semestre' : 'Segundo semestre' });
      D.bySemester(n).forEach(function (s) { group.appendChild(el('option', { value: s.id, text: s.name })); });
      select.appendChild(group);
    });
    select.value = value || 'all';
    if (onChange) select.addEventListener('change', function () { onChange(select.value); });
    return select;
  }

  function engineBadge(engine, model) {
    if (engine === 'easter') return el('span', { class: 'badge warn', text: 'Easter egg' });
    if (engine === 'local') return el('span', { class: 'badge', text: 'A.T.L.A.S' });
    if (engine === 'error+local') return el('span', { class: 'badge', text: 'Respaldo' });
    return el('span', { class: 'badge accent', text: model || 'IA' });
  }

  /* Chat real: usa ai.tutorReply y muestra SIEMPRE el origen de la respuesta. */
  function makeChat(opts) {
    var scope = opts.scope || 'general';
    var key = opts.key || 'general';
    var subjectId = opts.subjectId || 'general';
    var stored = scope === 'subject' ? (S.state.chat.subjects[key] || []) : S.state.chat.general;
    var wrap = el('section', { class: 'chat ' + (opts.tall ? 'tall' : 'compact'), 'aria-label': 'Conversación con el Maestro IA' });
    var body = el('div', { class: 'chat-body', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensajes' });
    var input = el('textarea', { rows: '1', placeholder: opts.placeholder || 'Pregúntale al Maestro IA…', 'aria-label': 'Escribe tu pregunta' });
    var sendBtn = el('button', { type: 'button', class: 'btn btn-primary btn-icon', 'aria-label': 'Enviar mensaje', title: 'Enviar' }, icon('i-send'));
    var contextChip = el('span', { class: 'badge accent', text: 'Contexto: ' + D.label(subjectId) });
    var clearBtn = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: function () {
      ui.confirm('Limpiar conversación', 'Se borrarán los mensajes de este chat en este dispositivo.', function () {
        S.clearChat(scope, key); ui.mount(body, [welcome()]); ui.toast('Chat reiniciado');
      });
    } }, [icon('i-trash'), el('span', { text: 'Limpiar' })]);

    var contextSelect = subjectSelect(subjectId, function (v) {
      if (v === 'all') return;
      go('/materia/' + v);
    }, true);
    contextSelect.classList.add('btn-sm');
    contextSelect.style.width = 'auto';
    contextSelect.style.maxWidth = '13rem';
    contextSelect.style.fontSize = '.76rem';
    contextSelect.style.minHeight = '34px';

    var head = el('div', { class: 'chat-head' }, [
      el('div', { class: 'title' }, [icon('i-brain'), el('h3', { text: opts.title || 'Maestro IA' }), contextChip]),
      el('div', { class: 'row-tight' }, [contextSelect, clearBtn])
    ]);

    function welcome() {
      var msg = subjectId === 'general'
        ? '¡Hola! Soy el **Maestro IA** de A.T.L.A.S. Puedo ayudarte con cualquier materia, tus apuntes o tu plan de estudio. ¿Qué repasamos hoy?'
        : '¡Hola! Estoy enfocado en **' + D.label(subjectId) + '**. Pregúntame sobre su temario, tus apuntes o pídeme un ejemplo clínico.';
      return messageNode({ role: 'ai', text: msg, engine: 'system', ts: S.now() });
    }

    function messageNode(m) {
      var bubble = el('div', { class: 'chat-bubble' + (m.engine === 'easter' ? ' easter' : '') });
      if (m.role === 'user' || m.engine === 'easter') bubble.textContent = m.text; /* texto exacto, sin markdown */
      else bubble.appendChild(ui.markdown(m.text));
      if (m.engine && m.engine !== 'system' && m.engine !== 'user') bubble.appendChild(el('div', { style: { marginTop: '.45rem' } }, engineBadge(m.engine, m.model)));
      bubble.appendChild(el('span', { class: 'chat-time', text: ui.fmtTime(m.ts) }));
      return el('div', { class: 'chat-msg' + (m.role === 'user' ? ' user' : '') }, [
        el('div', { class: 'chat-avatar' }, icon(m.role === 'user' ? 'i-users' : 'i-brain')), bubble
      ]);
    }

    stored.forEach(function (m) { body.appendChild(messageNode(m)); });
    if (!stored.length) body.appendChild(welcome());
    setTimeout(function () { body.scrollTop = body.scrollHeight; }, 0);

    var typing = null;
    function setBusy(busy) {
      input.disabled = busy; sendBtn.disabled = busy;
      if (busy) {
        typing = messageNode({ role: 'ai', text: '', engine: 'system', ts: S.now() });
        var bubble = typing.querySelector('.chat-bubble');
        ui.clear(bubble);
        bubble.appendChild(el('span', { class: 'typing' }, [el('i'), el('i'), el('i')]));
        body.appendChild(typing); body.scrollTop = body.scrollHeight;
      } else if (typing) { if (typing.parentNode) typing.remove(); typing = null; }
    }

    function history() {
      var list = scope === 'subject' ? (S.state.chat.subjects[key] || []) : S.state.chat.general;
      return list.slice(-8).map(function (m) { return { role: m.role, text: m.text }; });
    }

    async function send() {
      var text = input.value.trim();
      if (!text || input.disabled) return;
      var hist = history();
      input.value = ''; input.style.height = 'auto';
      S.pushMessage(scope, key, { role: 'user', text: text, engine: 'user' });
      body.appendChild(messageNode({ role: 'user', text: text, engine: 'user', ts: S.now() }));
      body.scrollTop = body.scrollHeight;
      setBusy(true);
      try {
        var res = await ai.tutorReply({ question: text, subjectId: subjectId, history: hist });
        S.pushMessage(scope, key, { role: 'ai', text: res.text, engine: res.engine });
        body.appendChild(messageNode({ role: 'ai', text: res.text, engine: res.engine, model: res.model, ts: S.now() }));
      } catch (e) {
        body.appendChild(messageNode({ role: 'ai', text: 'Error inesperado: ' + e.message, engine: 'error+local', ts: S.now() }));
      }
      setBusy(false);
      body.scrollTop = body.scrollHeight;
      refreshHeader();
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 128) + 'px';
    });

    var quick = el('div', { class: 'chat-actions' }, (opts.quick || [
      'Explícame los temas clave', 'Hazme 3 preguntas de repaso', '¿Cómo organizo mi estudio?'
    ]).map(function (q) {
      return el('button', { type: 'button', class: 'chip', onclick: function () { input.value = q; input.focus(); } }, q);
    }));

    ui.mount(wrap, [
      head, body,
      el('div', { class: 'chat-input' }, [input, sendBtn]),
      quick
    ]);
    wrap.focusInput = function () { input.focus(); };
    return wrap;
  }

  /* Mini-ventana de apuntes para la página de materia. */
  function miniNotes(subjectId) {
    var box = el('section', { class: 'card', 'aria-label': 'Apuntes de la materia' });
    var draftId = null;
    function render() {
      var notes = S.state.notes.filter(function (n) { return n.subjectId === subjectId; });
      var titleInput = el('input', { class: 'input', placeholder: 'Título del apunte', maxlength: C.LIMITS.maxTitle, 'aria-label': 'Título del apunte' });
      var content = el('textarea', { class: 'textarea', placeholder: 'Escribe aquí un apunte de ' + D.label(subjectId) + '…', 'aria-label': 'Contenido del apunte' });
      content.style.minHeight = '9rem';
      var status = el('span', { class: 'tiny faint', text: 'Autoguardado cada pocos segundos.' });
      function persist() {
        if (!titleInput.value.trim() && !content.value.trim()) return;
        var n = S.state.notes.find(function (x) { return x.id === draftId; });
        if (!n) { n = S.addNote(subjectId); draftId = n.id; }
        n.title = titleInput.value.trim() || 'Apunte de ' + D.label(subjectId);
        n.content = content.value.slice(0, C.LIMITS.maxText);
        n.updatedAt = S.now();
        var r = S.save();
        status.textContent = r.ok ? 'Guardado · ' + ui.fmtTime(S.now()) : r.error;
      }
      var save = ui.debounce(persist, 600);
      titleInput.addEventListener('input', save);
      content.addEventListener('input', save);

      ui.mount(box, [
        el('div', { class: 'card-head' }, [
          el('div', {}, [el('span', { class: 'eyebrow', text: 'APUNTES DE LA MATERIA' }), el('h3', { text: D.label(subjectId) })]),
          el('span', { class: 'badge accent', text: notes.length + ' apuntes' })
        ]),
        el('div', { class: 'col', style: { marginBottom: '1rem' } }, [
          el('span', { class: 'label', text: 'Nuevo apunte rápido' }), titleInput, content,
          el('div', { class: 'row' }, [status, el('span', { class: 'spacer' }),
            el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: function () {
              if (!titleInput.value.trim() && !content.value.trim()) { ui.toast('Escribe algo antes de guardar', 'warn'); return; }
              persist(); draftId = null;
              titleInput.value = ''; content.value = ''; render(); ui.toast('Apunte guardado');
            } }, [icon('i-plus'), el('span', { text: 'Guardar ya' })])])
        ]),
        el('hr', { class: 'divider' }),
        notes.length ? el('div', { class: 'col' }, notes.slice(0, 4).map(function (n) {
          return el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
            el('div', { class: 'col', style: { gap: '0', minWidth: '0' } }, [
              el('strong', { class: 'small', text: n.title }),
              el('span', { class: 'tiny faint', text: String(n.content).slice(0, 70) })
            ]),
            el('span', { class: 'tiny faint nowrap', text: ui.fmtDate(n.updatedAt) })
          ]);
        })) : ui.empty('i-book', 'Aún no hay apuntes', 'Escribe arriba o abre el editor completo.'),
        el('div', { style: { marginTop: '1rem' } }, ui.linkButton('Abrir todos mis apuntes', '#/apuntes?materia=' + subjectId, 'i-arrow', 'btn-primary btn-block'))
      ]);
    }
    render();
    return box;
  }

  /* ---------- VISTA: INICIO ---------- */
  register('/inicio', function () {
    var st = P.stats(), d = P.decision();
    var fact = D.randomFact();
    var chat = makeChat({ scope: 'general', key: 'general', subjectId: 'general', title: 'Maestro IA · bienvenida' });

    var factText = el('p', { class: 'fact-text', text: fact });
    var factCard = el('section', { class: 'card fact-card' }, [
      el('div', { class: 'fact-icon' }, icon('i-light')),
      el('div', { class: 'col' }, [
        el('span', { class: 'eyebrow', text: '¿SABÍAS QUE? · DATO CURIOSO DE MEDICINA' }),
        factText,
        el('div', {}, el('button', { type: 'button', class: 'btn btn-sm', onclick: function () {
          factText.textContent = D.randomFact(factText.textContent);
        } }, [icon('i-refresh'), el('span', { text: 'Otro dato' })]))
      ])
    ]);

    var hero = el('section', { class: 'hero' }, [
      el('div', { class: 'hero-inner' }, [
        el('span', { class: 'eyebrow', text: 'BIENVENIDA A TU ESPACIO DE ESTUDIO' }),
        S.state.demo ? el('div', { style: { marginTop: '.55rem' } }, el('span', { class: 'badge warn', text: 'VISTA DE DEMOSTRACIÓN · DATOS DE EJEMPLO' })) : null,
        el('h1', { class: 'hero-title', text: 'Bienvenido a A.T.L.A.S' }),
        el('p', { class: 'hero-sub', text: 'Tu espacio de estudio: apuntes, un profesor IA y simulacros a medida, con tu avance siempre a la vista.' }),
        el('div', { class: 'hero-actions' }, [
          el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
            var t = document.getElementById('semestres'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } }, [icon('i-spark'), el('span', { text: 'Elegir semestre' })]),
          ui.linkButton('Mis apuntes', '#/apuntes', 'i-book'),
          ui.linkButton('Ver progreso', '#/progreso', 'i-chart', 'btn-ghost')
        ]),
        el('div', { class: 'hero-stats' }, [
          el('div', { class: 'hero-stat' }, [el('strong', { class: 'mono', text: st.minutes7 + ' min' }), el('span', { text: 'estudiados (7 días)' })]),
          el('div', { class: 'hero-stat' }, [el('strong', { class: 'mono', text: String(st.streak) }), el('span', { text: 'días de racha' })]),
          el('div', { class: 'hero-stat' }, [el('strong', { class: 'mono', text: String(st.notesCount) }), el('span', { text: 'apuntes guardados' })]),
          el('div', { class: 'hero-stat' }, [el('strong', { class: 'mono', text: st.avgScore == null ? '—' : st.avgScore + '%' }), el('span', { text: 'promedio en tests' })])
        ])
      ])
    ]);

    var progressCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [el('span', { class: 'eyebrow', text: 'TU PROGRESO REAL' }), el('h3', { text: 'Avance general' })]),
        el('span', { class: 'badge accent', text: st.resultsCount + ' simulacros' })
      ]),
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('span', { class: 'small muted', text: 'Preparación global' }),
        el('strong', { class: 'mono', text: globalProgress(st) + '%' })
      ]),
      el('div', { style: { margin: '.6rem 0 1rem' } }, ui.progressBar(globalProgress(st))),
      ui.notice(d.action === 'descansar' ? 'warn' : 'info', '**' + d.title + '.** ' + d.message, d.action === 'descansar' ? 'i-heart' : 'i-light'),
      el('div', { style: { marginTop: '1rem' } }, ui.linkButton('Ver análisis completo y recomendación de la IA', '#/progreso', 'i-arrow', 'btn-primary btn-block'))
    ]);

    var adviceCard = el('section', { class: 'card soft' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: 'Empieza por aquí' })]),
      el('div', { class: 'tool-grid' }, [
        { i: 'i-brain', t: 'Pregunta al profesor', d: 'Resuelve dudas con contexto de tu materia.', h: '#/materia/anatomia1' },
        { i: 'i-book', t: 'Escribe un apunte', d: 'Se guarda y alimenta al tutor y a los exámenes.', h: '#/apuntes' },
        { i: 'i-spark', t: 'Haz un simulacro', d: 'Preguntas nuevas y explicación al terminar.', h: '#/examenes?materia=anatomia1' }
      ].map(function (x) {
        return el('a', { class: 'card card-hover tool-card quick-card', href: x.h }, [
          el('div', { class: 'tool-icon' }, icon(x.i)),
          el('strong', { class: 'small', text: x.t }),
          el('span', { class: 'tiny faint', text: x.d }),
          el('span', { class: 'quick-go' }, icon('i-arrow'))
        ]);
      }))
    ]);

    var semesters = el('section', { class: 'section', id: 'semestres' }, [
      sectionTitle('Selecciona tu semestre', el('span', { class: 'badge', text: '12 materias en total' })),
      el('div', { class: 'semester-grid' }, [1, 2].map(function (n) {
        var list = D.bySemester(n);
        var minutes = list.reduce(function (a, s) { return a + (st.perSubject[s.id] ? st.perSubject[s.id].minutes : 0); }, 0);
        return el('a', { class: 'semester-card', href: '#/semestre/' + n }, [
          el('span', { class: 'num', text: String(n) }),
          el('span', { class: 'eyebrow', text: n === 1 ? 'PRIMER SEMESTRE' : 'SEGUNDO SEMESTRE' }),
          el('h2', { text: n === 1 ? 'Bases de la medicina' : 'Profundización clínica' }),
          el('p', { class: 'muted small', text: n === 1 ? 'Materias introductorias y conceptos fundamentales.' : 'Materias avanzadas, prácticas y correlación clínica.' }),
          el('div', { class: 'row', style: { marginTop: '1.1rem' } }, [
            el('span', { class: 'badge accent', text: list.length + ' materias' }),
            el('span', { class: 'badge', text: Math.round(minutes) + ' min' })
          ]),
          el('div', { style: { marginTop: '1rem' } }, el('span', { class: 'btn btn-primary btn-block' }, [el('span', { text: 'Ver materias' }), icon('i-arrow')]))
        ]);
      }))
    ]);

    return [hero,
      el('div', { class: 'section grid grid-side' }, [chat, el('div', { class: 'col' }, [progressCard, adviceCard])]),
      semesters,
      el('section', { class: 'section' }, [sectionTitle('Dato curioso de medicina'), factCard])];
  });

  function globalProgress(st) {
    var vals = D.subjects.map(function (s) { return P.readiness(s.id).percent; });
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

  /* ---------- VISTA: SEMESTRE ---------- */
  register('/semestre/:n', function (params, parts) {
    var n = Number(parts[1]) === 2 ? 2 : 1;
    var list = D.bySemester(n);
    var st = P.stats();
    return [
      pageHeader({ eyebrow: 'PLAN DE ESTUDIOS', title: n === 1 ? 'Primer semestre' : 'Segundo semestre', sub: list.length + ' materias activas · elige una para estudiar con el Profesor IA.', back: '/inicio' }),
      el('div', { class: 'subject-grid' }, list.map(function (s) {
        var r = P.readiness(s.id);
        var art = el('div', { class: 'subject-art' }, icon(s.icon));
        art.style.background = D.gradient(s);
        return el('article', { class: 'card card-hover subject-card' }, [
          art,
          el('div', { class: 'subject-body' }, [
            el('div', { class: 'row-tight' }, [el('span', { class: 'badge accent', text: s.topics.length + ' temas' }), el('span', { class: 'badge', text: r.level })]),
            el('h3', { text: s.name }),
            el('p', { text: s.desc }),
            el('div', { class: 'col', style: { gap: '.3rem' } }, [
              el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
                el('span', { class: 'tiny faint', text: 'Preparación' }),
                el('span', { class: 'tiny strong mono', text: r.percent + '%' })
              ]),
              ui.progressBar(r.percent)
            ]),
            el('div', { class: 'subject-meta' }, [
              el('span', { text: r.notes + ' apuntes · ' + r.exams + ' tests' }),
              el('span', { text: Math.round(r.minutes) + ' min' })
            ]),
            el('a', { class: 'btn btn-primary btn-block', href: '#/materia/' + s.id }, [el('span', { text: 'Entrar a la materia' }), icon('i-arrow')])
          ])
        ]);
      })),
      null
    ];
  });

  /* ---------- VISTA: MATERIA ---------- */
  register('/materia/:id', function (params, parts) {
    var id = parts[1];
    var s = D.byId(id);
    if (!s) return [ui.empty('i-book', 'Materia no encontrada', 'Vuelve al inicio y elige un semestre.')];
    var r = P.readiness(id);
    var notesCount = S.state.notes.filter(function (n) { return n.subjectId === id; }).length;
    var chat = makeChat({ scope: 'subject', key: id, subjectId: id, title: 'Profesor IA · ' + s.name, tall: true,
      placeholder: 'Pregúntame sobre ' + s.name + '…',
      quick: ['Explícame el tema principal', 'Dame un caso clínico', 'Hazme 3 preguntas', 'Resume mis apuntes'] });

    var hero = el('section', { class: 'hero' }, [
      el('div', { class: 'hero-inner' }, [
        el('span', { class: 'eyebrow', text: (s.semester === 1 ? 'PRIMER' : 'SEGUNDO') + ' SEMESTRE · MATERIA' }),
        el('h1', { class: 'hero-title', text: s.name }),
        el('p', { class: 'hero-sub', text: s.desc }),
        el('div', { class: 'row', style: { marginTop: '1rem' } }, s.topics.map(function (t) { return el('span', { class: 'pill', text: t }); })),
        el('div', { class: 'row', style: { marginTop: '1.3rem' } }, [
          el('span', { class: 'badge accent', text: r.level }),
          el('span', { class: 'badge', text: notesCount + ' apuntes' }),
          el('span', { class: 'badge', text: r.exams + ' simulacros' })
        ]),
        el('div', { style: { marginTop: '1rem', maxWidth: '26rem' } }, ui.progressBar(r.percent))
      ])
    ]);

    var tools = [
      { icon: 'i-brain', title: 'Profesor IA', text: 'Tutor con contexto de ' + s.name + ': conoce el temario y tus apuntes de esta materia.', action: function () { chat.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { chat.focusInput(); }, 350); }, label: 'Hablar con el profesor' },
      { icon: 'i-book', title: 'Apuntes de la materia', text: 'Ventana rápida para escribir y consultar tus apuntes de ' + s.name + '.', action: function () { document.getElementById('notes-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, label: 'Ir a la ventana de apuntes' },
      { icon: 'i-spark', title: 'Simulacro IA o comunidad', text: 'Genera un examen con IA sobre esta materia o resuelve uno subido por otro estudiante.', href: '#/examenes?materia=' + id, label: 'Ver simulacros' },
      { icon: 'i-file', title: 'Todos mis apuntes', text: 'Abre tu cuaderno completo filtrado por ' + s.name + '.', href: '#/apuntes?materia=' + id, label: 'Abrir mi cuaderno' }
    ];

    return [
      pageHeader({ noTitle: true, back: '/semestre/' + s.semester,
        action: ui.linkButton('Simulacros', '#/examenes?materia=' + id, 'i-spark', 'btn-primary btn-sm') }),
      hero,
      el('section', { class: 'section' }, [sectionTitle('Herramientas de estudio'),
        el('div', { class: 'tool-grid' }, tools.map(function (t) {
          return el('article', { class: 'card card-hover tool-card' }, [
            el('div', { class: 'tool-icon' }, icon(t.icon)),
            el('h3', { text: t.title }), el('p', { text: t.text }),
            t.href ? ui.linkButton(t.label, t.href, 'i-arrow', 'btn btn-block') : ui.button(t.label, 'i-arrow', 'btn btn-block', t.action)
          ]);
        }))]),
      el('section', { class: 'section grid grid-side', id: 'study-panels' }, [
        chat,
        el('div', { id: 'notes-panel' }, miniNotes(id))
      ]),
      null
    ];
  });

  /* ---------- VISTA: APUNTES ---------- */
  register('/apuntes', function (params) {
    var filter = params.materia && D.byId(params.materia) ? params.materia : 'all';
    var layout = el('div', { class: 'notes-layout' });
    var editor = el('section', { class: 'card note-editor' });
    var listBox = el('div', { class: 'notes-list', role: 'list' });
    var activeId = null;
    var saveStatus = null;

    function notes() { return S.state.notes.filter(function (n) { return filter === 'all' || n.subjectId === filter; }); }

    function renderList() {
      ui.mount(listBox, notes().length ? notes().map(function (n) {
        return el('button', { type: 'button', role: 'listitem', class: 'note-item' + (n.id === activeId ? ' active' : ''), onclick: function () { activeId = n.id; renderList(); renderEditor(); } }, [
          el('strong', { text: n.title || 'Sin título' }),
          el('span', { text: D.label(n.subjectId) + ' · ' + ui.fmtDate(n.updatedAt) })
        ]);
      }) : el('div', { class: 'col' }, ui.empty('i-book', 'Sin apuntes', 'Crea uno con el botón «Nuevo apunte».')));
    }

    function renderEditor() {
      var n = S.state.notes.find(function (x) { return x.id === activeId; });
      if (!n) {
        ui.mount(editor, ui.empty('i-book', 'Selecciona o crea un apunte', 'Tus apuntes se guardan en este dispositivo y sirven de contexto al Profesor IA.'));
        return;
      }
      var title = el('input', { class: 'note-title-input', value: n.title, maxlength: C.LIMITS.maxTitle, 'aria-label': 'Título del apunte' });
      var subj = subjectSelect(n.subjectId, null, true);
      var content = el('textarea', { class: 'textarea note-content', value: n.content, placeholder: 'Escribe aquí tus apuntes…', 'aria-label': 'Contenido del apunte', maxlength: C.LIMITS.maxText });
      saveStatus = el('span', { class: 'tiny faint', text: 'Guardado · ' + ui.fmtTime(n.updatedAt) });
      var persist = ui.debounce(function () {
        n.title = title.value.slice(0, C.LIMITS.maxTitle) || 'Sin título';
        n.content = content.value.slice(0, C.LIMITS.maxText);
        n.subjectId = subj.value === 'all' ? 'general' : subj.value;
        n.updatedAt = S.now();
        var r = S.save();
        if (saveStatus) saveStatus.textContent = r.ok ? 'Guardado · ' + ui.fmtTime(S.now()) : r.error;
        renderList();
      }, 450);
      [title, content].forEach(function (x) { x.addEventListener('input', persist); });
      subj.addEventListener('change', persist);

      var summaryBtn = ui.button('Resumir / flashcards con IA', 'i-spark', 'btn btn-sm', async function () {
        var box = el('div', { class: 'col' }, ui.spinner('Analizando tu apunte…'));
        var m = ui.modal({ title: 'Resumen del apunte', body: box, actions: [
          { label: 'Cerrar', kind: 'btn' },
          { label: 'Añadir al apunte', kind: 'btn-primary', keepOpen: true, onClick: function () {
            content.value = content.value + '\n\n' + (box.dataset.plain || '');
            content.dispatchEvent(new Event('input'));
            ui.toast('Resumen añadido al apunte');
          } }
        ] });
        var res = await ai.summarize(content.value);
        box.dataset.plain = res.text;
        ui.mount(box, [el('div', { class: 'small' }, ui.markdown(res.text)), el('div', {}, engineBadge(res.engine))]);
      });

      ui.mount(editor, [
        el('div', { class: 'row' }, [title,
          el('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': 'Eliminar apunte', onclick: function () {
            ui.confirm('Eliminar apunte', '«' + n.title + '» se borrará definitivamente de este dispositivo.', function () {
              S.deleteNote(n.id); activeId = null; renderList(); renderEditor(); ui.toast('Apunte eliminado');
            });
          } }, icon('i-trash'))]),
        el('div', { class: 'row' }, [el('span', { class: 'label', text: 'Materia' }), subj]),
        content,
        el('div', { class: 'row' }, [saveStatus, el('span', { class: 'spacer' }), summaryBtn])
      ]);
    }

    var filterSelect = subjectSelect(filter, function (v) {
      filter = v; go('/apuntes' + (v === 'all' ? '' : '?materia=' + v));
    });
    filterSelect.style.maxWidth = '16rem';

    var importInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, 'aria-label': 'Importar copia de seguridad' });
    importInput.addEventListener('change', function () {
      var f = importInput.files && importInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(String(reader.result));
          var r = S.importBackup(obj);
          ui.toast('Copia importada: ' + r.notes + ' apuntes, ' + r.exams + ' exámenes');
          renderList(); renderEditor();
        } catch (e) { ui.toast('Archivo inválido: ' + e.message, 'err'); }
        importInput.value = '';
      };
      reader.readAsText(f);
    });

    var toolbar = el('div', { class: 'row', style: { marginBottom: '1rem' } }, [
      filterSelect,
      ui.button('Nuevo apunte', 'i-plus', 'btn btn-primary btn-sm', function () {
        var n = S.addNote(filter === 'all' ? 'general' : filter);
        activeId = n.id; renderList(); renderEditor();
        var t = editor.querySelector('.note-title-input'); if (t) { t.focus(); t.select(); }
      }),
      ui.button('Descargar .txt', 'i-download', 'btn btn-sm', function () {
        var text = S.exportNotesText();
        S.download('Apuntes_ATLAS_' + new Date().toISOString().slice(0, 10) + '.txt', text);
        ui.toast('Apuntes descargados');
      }),
      ui.button('Copia .json', 'i-download', 'btn btn-sm', function () {
        S.download('atlas-backup_' + new Date().toISOString().slice(0, 10) + '.json', S.exportBackup(), 'application/json');
        ui.toast('Copia de seguridad descargada');
      }),
      ui.button('Importar', 'i-upload', 'btn btn-sm', function () { importInput.click(); }),
      importInput
    ]);

    renderList(); renderEditor();
    ui.mount(layout, [el('section', { class: 'card' }, [el('span', { class: 'eyebrow', text: 'MIS APUNTES' }), el('h3', { text: 'Cuaderno de estudio' }), el('div', { style: { marginTop: '.8rem' } }, listBox)]), editor]);

    return [
      pageHeader({ eyebrow: 'CUADERNO', title: 'Mis apuntes', sub: 'Todo lo que has escrito, organizado por materia. Se guarda en tu dispositivo y alimenta al Profesor IA y a los simulacros.' }),
      toolbar, layout
    ];
  });

  /* ---------- router ---------- */
  function render() {
    var r = parseHash();
    var parts = r.path.split('/').filter(Boolean);
    var key = null;
    if (r.path === '/inicio' || r.path === '/') key = '/inicio';
    else if (parts[0] === 'semestre') key = '/semestre/:n';
    else if (parts[0] === 'materia') key = '/materia/:id';
    else if (parts[0] === 'apuntes') key = '/apuntes';
    else if (parts[0] === 'progreso') key = '/progreso';
    else if (parts[0] === 'ajustes') key = '/ajustes';
    else if (parts[0] === 'examenes') key = '/examenes';
    else if (parts[0] === 'simulacro') key = '/simulacro/:id';
    var fn = views[key];
    var content;
    try {
      content = fn ? fn(r.params, parts) : [ui.empty('i-book', 'Página no encontrada', 'Vuelve al inicio para continuar.')];
    } catch (e) {
      content = [ui.notice('danger', 'Error al renderizar esta vista: ' + e.message)];
      console.error(e);
    }
    ui.mount(viewRoot, content);
    renderNav('/' + (parts[0] || 'inicio'));
    refreshHeader();
    viewRoot.focus({ preventScroll: true });
    if (location.hash.indexOf('#semestres') === 0) {
      setTimeout(function () { var t = document.getElementById('semestres'); if (t) t.scrollIntoView({ behavior: 'smooth' }); }, 50);
    }
  }

  /* ---------- arranque ---------- */
  function boot() {
    viewRoot = document.getElementById('view');
    navRoot = document.getElementById('main-nav');
    S.state.theme && document.documentElement.setAttribute('data-theme', S.state.theme);
    document.getElementById('quick-theme').addEventListener('click', cycleTheme);
    window.addEventListener('hashchange', render);

    A.init().then(function () {
      refreshAI();
      render();
      refreshHeader();
      if (S.state.__migrationChanges) {
        ui.toast('Datos de la versión anterior migrados correctamente', 'ok', 6000);
        delete S.state.__migrationChanges; S.save();
      }
      registerServiceWorker();
    });
  }

  function registerServiceWorker() {
    if (global.ATLAS_SINGLE_FILE) return; /* build de un solo archivo: no hay sw.js */
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* modo offline opcional */ });
  }

  global.ATLAS = global.ATLAS || {};
  global.ATLAS.app = {
    register: register, go: go, render: render, parseHash: parseHash,
    refreshHeader: refreshHeader, refreshAI: refreshAI, pageHeader: pageHeader, sectionTitle: sectionTitle,
    subjectSelect: subjectSelect, makeChat: makeChat, miniNotes: miniNotes,
    engineBadge: engineBadge, THEMES: THEMES, globalProgress: globalProgress
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
