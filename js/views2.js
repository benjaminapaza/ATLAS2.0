/* =========================================================================
   Vistas: Progreso, Ajustes, Simulacros/Comunidad y jugador de exámenes.
   Se registran antes de DOMContentLoaded (app.js arranca después).
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
  var app = global.ATLAS.app;
  var el = ui.el, icon = ui.icon;

  /* Reloj global del cronómetro: actualiza el display si está visible. */
  setInterval(function () {
    var d = document.getElementById('timer-display');
    if (d) d.textContent = P.formatElapsed(P.elapsedMs());
  }, 1000);

  /* ======================= PROGRESO ======================= */
  app.register('/progreso', function () {
    var st = P.stats(), d = P.decision();
    var adviceBox = el('div', { class: 'col' }, ui.spinner('Consultando al Maestro IA con tus datos reales…'));

    function loadAdvice() {
      ui.mount(adviceBox, ui.spinner('Consultando al Maestro IA con tus datos reales…'));
      P.adviceText().then(function (a) {
        ui.mount(adviceBox, [
          el('div', { class: 'row' }, [
            el('h2', { text: a.titulo }),
            app.engineBadge(a.engine === 'local' ? 'local' : 'proxy', a.model)
          ]),
          el('div', { class: 'small' }, ui.markdown(a.mensaje)),
          a.accion === 'examen' && a.subjectId ? el('div', { class: 'row' }, [
            ui.linkButton('Generar examen final de ' + D.label(a.subjectId), '#/examenes?materia=' + a.subjectId + '&final=1', 'i-spark', 'btn btn-sm btn-primary')
          ]) : null
        ]);
      }).catch(function (e) {
        ui.mount(adviceBox, ui.notice('danger', 'No se pudo calcular la recomendación: ' + e.message));
      });
    }

    var adviceCard = el('section', { class: 'card advice' }, [
      el('div', { class: 'advice-icon' }, icon('i-brain')),
      el('div', { class: 'col', style: { flex: '1', minWidth: '0' } }, [
        el('span', { class: 'eyebrow', text: 'VEREDICTO BASADO EN TUS DATOS' }),
        adviceBox,
        el('div', { class: 'row' }, [
          ui.button('Actualizar análisis', 'i-refresh', 'btn btn-sm', loadAdvice),
          el('span', { class: 'tiny faint', text: 'Regla aplicada: ' + d.reason })
        ])
      ])
    ]);

    var statsCard = el('section', { class: 'section' }, [
      app.sectionTitle('Tus números'),
      el('div', { class: 'stat-grid' }, [
        ui.stat(String(st.minutesToday), 'minutos hoy'),
        ui.stat(String(st.minutes7), 'minutos · 7 días'),
        ui.stat(String(st.streak), 'días de racha'),
        ui.stat(String(st.notesCount), 'apuntes'),
        ui.stat(String(st.resultsCount), 'simulacros'),
        ui.stat(st.avgScore == null ? '—' : st.avgScore + '%', 'promedio tests')
      ])
    ]);

    var week = el('div', { class: 'grid grid-4' }, Array.from({ length: 7 }, function (_, i) {
      var date = new Date(); date.setDate(date.getDate() - (6 - i));
      var key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      var mins = Math.round(st.byDay[key] || 0);
      var pct = Math.min(100, (mins / 180) * 100);
      return el('div', { class: 'stat' }, [
        el('span', { class: 'caption', text: date.toLocaleDateString('es-BO', { weekday: 'short' }) }),
        el('span', { class: 'value mono', style: { fontSize: '1.15rem' }, text: mins + 'm' }),
        ui.progressBar(pct)
      ]);
    }));

    var display = el('span', { class: 'timer-value', id: 'timer-display', text: P.formatElapsed(P.elapsedMs()) });
    var timerSubject = app.subjectSelect(P.timer.subjectId || 'general', function (v) { P.timer.subjectId = v === 'all' ? '' : v; }, true);
    timerSubject.style.maxWidth = '15rem';
    var timerCard = el('section', { class: 'card' }, [
      el('span', { class: 'eyebrow', text: 'SESIÓN DE ESTUDIO REAL' }),
      el('h3', { text: 'Cronómetro' }),
      el('p', { class: 'small muted', text: 'El tiempo que registres aquí alimenta el veredicto de la IA. Se guarda como sesión al detener.' }),
      el('div', { class: 'timer-box', style: { marginTop: '.8rem' } }, [
        display,
        ui.button(P.timer.running ? 'Pausar' : 'Iniciar', P.timer.running ? 'i-clock' : 'i-play', 'btn btn-sm btn-primary', function () {
          if (P.timer.running) P.pauseTimer(); else P.startTimer(timerSubject.value === 'all' ? '' : timerSubject.value);
          app.render();
        }),
        ui.button('Detener y guardar', 'i-check', 'btn btn-sm', function () {
          var s = P.stopTimer();
          ui.toast(s ? 'Sesión guardada: ' + s.minutes + ' min' : 'Sesión demasiado corta (mínimo 30 s)', s ? 'ok' : 'warn');
          app.render();
        }),
        ui.button('+25 min manual', 'i-plus', 'btn btn-sm', function () {
          S.addSession(25, timerSubject.value === 'all' ? '' : timerSubject.value, 'manual');
          ui.toast('25 minutos registrados'); app.render();
        })
      ]),
      el('div', { class: 'row', style: { marginTop: '.8rem' } }, [el('span', { class: 'label', text: 'Materia' }), timerSubject])
    ]);

    var readinessCard = el('section', { class: 'card' }, [
      el('span', { class: 'eyebrow', text: 'PREPARACIÓN POR MATERIA' }),
      el('h3', { text: '¿Ya puedes dar el examen final?' }),
      el('p', { class: 'small muted', text: 'Se calcula con minutos reales, apuntes y resultados de simulacros. La IA avisa cuando se cumple el objetivo.' }),
      el('div', { style: { marginTop: '1rem' } }, D.subjects.map(function (s) {
        var r = P.readiness(s.id);
        return el('div', { class: 'subject-row' }, [
          el('div', { class: 'col', style: { gap: '.35rem', minWidth: '0' } }, [
            el('div', { class: 'row-tight' }, [
              el('strong', { class: 'small', text: s.name }),
              el('span', { class: 'badge ' + (r.canFinal ? 'ok' : r.percent >= 50 ? 'accent' : ''), text: r.canFinal ? 'Listo para examen' : r.level })
            ]),
            ui.progressBar(r.percent),
            el('span', { class: 'tiny faint', text: Math.round(r.minutes) + ' min · ' + r.notes + ' apuntes · ' + r.exams + ' tests · ' + (r.avg == null ? 'sin nota' : r.avg + '%') })
          ]),
          el('div', { class: 'row-tight' }, [
            ui.linkButton('Estudiar', '#/materia/' + s.id, null, 'btn btn-sm'),
            r.canFinal ? el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: function () { app.go('/examenes?materia=' + s.id + '&final=1'); } }, 'Examen final')
              : el('span', { class: 'tiny faint', text: 'Falta ' + (100 - r.percent) + '%' })
          ])
        ]);
      }))
    ]);

    loadAdvice();
    return [
      app.pageHeader({ eyebrow: 'SEGUIMIENTO', title: 'Tu progreso', sub: 'Datos reales de estudio: sesiones, apuntes y resultados. Sin porcentajes inventados.' }),
      adviceCard,
      el('div', { class: 'section grid grid-2' }, [statsCard, timerCard]),
      el('section', { class: 'section' }, [app.sectionTitle('Últimos 7 días'), week]),
      el('section', { class: 'section' }, readinessCard)
    ];
  });

  /* ======================= AJUSTES ======================= */
  app.register('/ajustes', function () {
    var st = S.state;

    /* ---- Cuenta Gmail ---- */
    var emailInput = el('input', { class: 'input', type: 'email', value: st.profile.email, placeholder: 'tucuenta@gmail.com', 'aria-label': 'Correo de Gmail' });
    var nameInput = el('input', { class: 'input', value: st.profile.name, placeholder: 'Tu nombre', 'aria-label': 'Nombre' });
    var accountStatus = el('div', { class: 'col', style: { marginTop: '.8rem' } });
    function refreshAccount() {
      ui.mount(accountStatus, st.profile.email
        ? ui.notice('ok', 'Progreso asociado a **' + st.profile.email + '**' +
            (st.profile.syncedAt ? ' · Última sincronización: ' + ui.fmtDate(st.profile.syncedAt) : ''))
        : ui.notice('info', 'Guarda tu correo para llevar tu progreso a otro dispositivo.'));
    }
    var accountCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('div', {}, [el('span', { class: 'eyebrow', text: 'CUENTA' }), el('h3', { text: 'Tu cuenta' })])]),
      el('div', { class: 'grid grid-2' }, [
        ui.field('Correo electrónico', emailInput),
        ui.field('Nombre visible', nameInput)
      ]),
      el('div', { class: 'row', style: { marginTop: '1rem' } }, [
        ui.button('Guardar cuenta', 'i-check', 'btn btn-primary btn-sm', function () {
          var email = emailInput.value.trim();
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ui.toast('Escribe un correo válido', 'err'); return; }
          S.update(function (s) { s.profile.email = email; s.profile.name = nameInput.value.trim(); });
          app.refreshHeader(); refreshAccount(); ui.toast('Cuenta guardada');
        }),
        ui.button('Sincronizar ahora', 'i-upload', 'btn btn-sm', function () {
          A.syncProgress().then(function (r) {
            S.update(function (s) { s.profile.syncedAt = S.now(); });
            ui.toast(r && r.message ? r.message : 'Progreso sincronizado con ' + A.label);
            refreshAccount();
          }).catch(function (e) { ui.toast(e.message, 'err'); });
        }),
        ui.button('Cargar desde la nube', 'i-download', 'btn btn-sm', function () {
          A.loadProgress().then(function (data) {
            if (!data || !data.totals) { ui.toast(A.isShared ? 'No hay progreso guardado para esta cuenta.' : 'En modo local usa «Importar copia».', 'warn'); return; }
            var added = 0;
            S.update(function (s) {
              var seenS = {}; s.sessions.forEach(function (x) { seenS[x.id] = 1; });
              var seenR = {}; s.results.forEach(function (x) { seenR[x.id] = 1; });
              (data.sessions || []).forEach(function (x) { if (!seenS[x.id]) { s.sessions.push(x); added++; } });
              (data.results || []).forEach(function (x) { if (!seenR[x.id]) { s.results.push(x); added++; } });
            });
            ui.toast('Progreso restaurado: ' + added + ' registros nuevos');
            app.render();
          }).catch(function (e) { ui.toast(e.message, 'err'); });
        })
      ]),
      accountStatus
    ]);
    refreshAccount();

    /* ---- Temas ---- */
    var themeCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('div', {}, [el('span', { class: 'eyebrow', text: 'APARIENCIA' }), el('h3', { text: 'Tema visual' })])]),
      el('div', { class: 'theme-grid' }, app.THEMES.map(function (t) {
        var sw = el('span', { class: 'theme-swatch' }, t.colors.map(function (c) {
          var i = el('i'); i.style.background = c; return i;
        }));
        return el('button', { type: 'button', class: 'theme-option' + (st.theme === t.id ? ' active' : ''), 'aria-pressed': st.theme === t.id ? 'true' : 'false',
          onclick: function () { S.setTheme(t.id); app.render(); app.refreshHeader(); ui.toast('Tema ' + t.label + ' aplicado', 'ok', 1600); }
        }, [sw, el('span', { text: t.label }), st.theme === t.id ? el('span', { class: 'badge accent', text: 'Activo' }) : null]);
      }))
    ]);

    /* ---- Inteligencia Artificial ---- */
    var providerSelect = el('select', { class: 'select', 'aria-label': 'Proveedor de IA' });
    Object.keys(C.PROVIDERS).forEach(function (k) {
      providerSelect.appendChild(el('option', { value: k, text: C.PROVIDERS[k].label }));
    });
    providerSelect.value = st.ai.provider;
    var modelSelect = el('select', { class: 'select', 'aria-label': 'Modelo de IA' });
    function fillModels() {
      ui.clear(modelSelect);
      var cfg = C.PROVIDERS[providerSelect.value];
      if (!cfg.models.length) modelSelect.appendChild(el('option', { value: '', text: 'Modelo del endpoint (escríbelo abajo)' }));
      cfg.models.forEach(function (m) { modelSelect.appendChild(el('option', { value: m.id, text: m.label })); });
      var saved = st.ai.model;
      if (saved && Array.from(modelSelect.options).some(function (o) { return o.value === saved; })) modelSelect.value = saved;
      else modelSelect.value = cfg.defaultModel;
    }
    fillModels();
    var keyInput = el('input', { type: 'hidden', value: '' }); /* la clave vive en el servidor */
    var customInput = el('input', { class: 'input', value: st.ai.customEndpoint, placeholder: 'https://…/v1/chat/completions', 'aria-label': 'Endpoint personalizado' });
    var customField = ui.field('Endpoint personalizado', customInput, 'Para Ollama, Groq, OpenRouter u otro compatible con OpenAI.');
    var aiStatusBox = el('div', { class: 'col' });
    var testResult = el('div', { class: 'col' });
    function refreshAIStatus() {
      var s = ai.status();
      ui.mount(aiStatusBox, ui.notice(s.real ? 'ok' : 'warn', '**' + s.label + '.** ' + s.detail));
    }
    refreshAIStatus();
    function saveAI() {
      S.update(function (s) {
        s.ai.provider = providerSelect.value;
        s.ai.model = modelSelect.value;
        s.ai.keys[providerSelect.value] = keyInput.value.trim();
        s.ai.customEndpoint = customInput.value.trim();
      });
      app.refreshAI(); refreshAIStatus(); app.refreshHeader();
      ui.toast('Configuración de IA guardada');
    }
    providerSelect.addEventListener('change', function () {
      keyInput.value = st.ai.keys[providerSelect.value] || '';
      fillModels();
      customField.style.display = providerSelect.value === 'custom' ? '' : 'none';
    });
    customField.style.display = st.ai.provider === 'custom' ? '' : 'none';

    var aiCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('div', {}, [el('span', { class: 'eyebrow', text: 'INTELIGENCIA ARTIFICIAL REAL' }), el('h3', { text: 'Modelo del Maestro IA' })])]),
      aiStatusBox,
      el('div', { class: 'grid grid-2', style: { marginTop: '1rem' } }, [
        ui.field('Proveedor', providerSelect),
        ui.field('Modelo', modelSelect)
      ]),
      el('div', { style: { marginTop: '.8rem' } }, customField),
      keyInput,
      el('div', { class: 'row', style: { marginTop: '1rem' } }, [
        ui.button('Guardar configuración', 'i-check', 'btn btn-primary btn-sm', saveAI),
        ui.button('Probar conexión', 'i-spark', 'btn btn-sm', function () {
          saveAI();
          ui.mount(testResult, ui.spinner('Haciendo una llamada real al modelo…'));
          ai.testConnection().then(function (r) {
            ui.mount(testResult, r.ok
              ? ui.notice('ok', '**Conexión real verificada.** El modelo ' + (r.model || '') + ' respondió: «' + r.text + '» vía ' + (r.mode === 'proxy' ? 'servidor' : 'clave propia') + '.')
              : ui.notice('danger', '**El modelo no respondió.** ' + r.message));
            refreshAIStatus();
          });
        }),
      ]),
      testResult
    ]);

    /* ---- Datos ---- */
    var importInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, 'aria-label': 'Importar copia' });
    importInput.addEventListener('change', function () {
      var f = importInput.files && importInput.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { var r = S.importBackup(JSON.parse(String(reader.result))); ui.toast('Importado: ' + r.notes + ' apuntes, ' + r.exams + ' exámenes'); app.render(); }
        catch (e) { ui.toast('Archivo inválido: ' + e.message, 'err'); }
        importInput.value = '';
      };
      reader.readAsText(f);
    });
    var demoNotice = el('div', { class: 'col' });
    function refreshDemoNotice() {
      ui.mount(demoNotice, S.state.demo
        ? ui.notice('warn', '**Vista de demostración activa.** Datos de ejemplo; quítalos con un clic.')
        : ui.notice('info', 'Muestra el dashboard completo con datos de ejemplo. Se quitan con un clic.'));
    }
    refreshDemoNotice();
    var demoBtn = ui.button(S.state.demo ? 'Quitar datos de demostración' : 'Cargar datos de demostración',
      S.state.demo ? 'i-refresh' : 'i-spark', 'btn btn-sm', function () {
        if (S.state.demo) { S.clearDemo(); ui.toast('Datos de demostración eliminados'); }
        else { var r = S.loadDemo(); ui.toast('Demo cargada: ' + r.sessions + ' sesiones, ' + r.notes + ' apuntes y ' + r.results + ' resultados'); }
        refreshDemoNotice();
        demoBtn.querySelector('span').textContent = S.state.demo ? 'Quitar datos de demostración' : 'Cargar datos de demostración';
        app.refreshHeader();
      });

    var dataCard = el('section', { class: 'card' }, [
      el('span', { class: 'eyebrow', text: 'TUS DATOS' }),
      el('h3', { text: 'Descargas y copias de seguridad' }),
      demoNotice,
      el('div', { class: 'row', style: { marginTop: '.8rem' } }, [demoBtn]),
      el('div', { class: 'row', style: { marginTop: '1rem' } }, [
        ui.button('Descargar apuntes (.txt)', 'i-download', 'btn btn-sm', function () {
          S.download('Apuntes_ATLAS_' + new Date().toISOString().slice(0, 10) + '.txt', S.exportNotesText());
          ui.toast('Apuntes descargados');
        }),
        ui.button('Copia completa (.json)', 'i-download', 'btn btn-sm', function () {
          S.download('atlas-backup_' + new Date().toISOString().slice(0, 10) + '.json', S.exportBackup(), 'application/json');
          ui.toast('Copia descargada');
        }),
        ui.button('Importar copia', 'i-upload', 'btn btn-sm', function () { importInput.click(); }),
        importInput,
        ui.button('Borrar todos mis datos', 'i-trash', 'btn btn-sm btn-danger', function () {
          ui.confirm('Borrar todo', 'Se eliminarán apuntes, sesiones, resultados y exámenes de este dispositivo. Esta acción no se puede deshacer.', function () {
            S.reset(); ui.toast('Datos borrados'); app.render();
          });
        })
      ])
    ]);

    /* ---- Opinión pública ---- */
    var opinionText = el('textarea', { class: 'textarea', placeholder: 'Cuéntanos qué te parece A.T.L.A.S…', maxlength: '1000', 'aria-label': 'Tu opinión' });
    var opinionAuthor = el('input', { class: 'input', value: st.profile.name, placeholder: 'Tu nombre (opcional)', 'aria-label': 'Autor' });
    var opinionList = el('div', { class: 'col' }, ui.spinner('Cargando opiniones…'));
    function loadOpinions() {
      A.listOpinions().then(function (list) {
        ui.mount(opinionList, list.length ? list.slice(0, 12).map(function (o) {
          return el('div', { class: 'opinion' }, [
            el('p', { text: o.text }),
            el('span', { class: 'tiny faint', text: (o.author || 'Anónimo') + ' · ' + ui.fmtDate(o.ts) })
          ]);
        }) : ui.empty('i-users', 'Aún no hay opiniones', 'Sé la primera persona en dejar una.'));
      }).catch(function () { ui.mount(opinionList, ui.notice('danger', 'No se pudieron cargar las opiniones.')); });
    }
    loadOpinions();
    var opinionCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [el('span', { class: 'eyebrow', text: 'COMUNIDAD' }), el('h3', { text: 'Dejar una opinión pública' })]),
        el('span', { class: 'badge ' + (A.isShared ? 'ok' : ''), text: A.isShared ? 'Visible para todos los usuarios' : 'Solo en este dispositivo' })
      ]),
      el('div', { class: 'col' }, [
        opinionText,
        el('div', { class: 'row' }, [
          opinionAuthor,
          ui.button('Publicar opinión', 'i-send', 'btn btn-primary btn-sm', function () {
            var text = opinionText.value.trim();
            if (!text) { ui.toast('Escribe una opinión antes de publicar', 'warn'); return; }
            A.publishOpinion(text, opinionAuthor.value.trim() || st.profile.name || 'Anónimo').then(function () {
              opinionText.value = ''; ui.toast('Opinión publicada'); loadOpinions();
            }).catch(function (e) { ui.toast(e.message, 'err'); });
          })
        ])
      ]),
      el('hr', { class: 'divider' }),
      el('span', { class: 'label', text: 'OPINIONES RECIENTES' }),
      opinionList
    ]);

    /* ---- Versión (el nombre del creador solo existe en comentarios) ---- */
    /* Creador: benja — este comentario y el de index.html son los únicos lugares donde aparece. */
    var versionCard = el('section', { class: 'card version-card' }, [
      el('div', { class: 'version-logo', text: 'A' }),
      el('div', { class: 'col' }, [
        el('span', { class: 'eyebrow', text: 'INFORMACIÓN' }),
        el('h3', { text: 'A.T.L.A.S v' + C.VERSION }),
        el('p', { class: 'small muted', text: C.BUILD + ' · Análisis y Tutoría Lógica Adaptativa Superior' }),
        el('ul', { class: 'list-plain' }, [
          'Tutor IA real (Gemini / OpenAI) con contexto por materia y respaldo local honesto.',
          'Simulacros generados por IA y exámenes de la comunidad.',
          'Progreso medido con sesiones, apuntes y resultados reales.',
          'Cinco temas, modo offline (PWA) y datos exportables.'
        ].map(function (t) { return el('li', {}, [icon('i-check'), el('span', { text: t })]); })),
        el('span', { class: 'tiny faint', text: '© ' + new Date().getFullYear() + ' · Todos los derechos reservados.' })
      ]),
      document.createComment(' creador: benja — solo visible en el código fuente, nunca en la página ')
    ]);

    return [
      app.pageHeader({ eyebrow: 'CONFIGURACIÓN', title: 'Ajustes', sub: 'Cuenta, temas, modelo de IA, copias de seguridad y opiniones.' }),
      el('div', { class: 'grid grid-2' }, [accountCard, themeCard]),
      el('div', { class: 'section' }, aiCard),
      el('div', { class: 'section grid grid-2' }, [dataCard, opinionCard]),
      el('div', { class: 'section' }, versionCard)
    ];
  });

  /* ======================= EXÁMENES / COMUNIDAD ======================= */
  app.register('/examenes', function (params) {
    var subjectId = params.materia && (D.byId(params.materia) || params.materia === 'general') ? params.materia : 'general';
    var wantFinal = params.final === '1';
    var r = subjectId !== 'general' ? P.readiness(subjectId) : null;
    var statusBox = el('div', { class: 'col' });
    var listBox = el('div', { class: 'col' }, ui.spinner('Cargando exámenes…'));

    var countSelect = el('select', { class: 'select', 'aria-label': 'Número de preguntas' });
    [5, 10, 15, 20].forEach(function (n) { countSelect.appendChild(el('option', { value: String(n), text: n + ' preguntas' })); });
    countSelect.value = '10';
    var diffSelect = el('select', { class: 'select', 'aria-label': 'Dificultad' });
    [['basica', 'Básica'], ['intermedia', 'Intermedia'], ['avanzada', 'Avanzada']].forEach(function (x) { diffSelect.appendChild(el('option', { value: x[0], text: x[1] })); });
    diffSelect.value = 'intermedia';

    async function generate(finalExam) {
      ui.mount(statusBox, ui.spinner(ai.status().real ? 'El modelo está redactando y validando las preguntas…' : 'Construyendo el examen con tus apuntes y el temario…'));
      try {
        var res = await ai.generateQuiz({
          subjectId: subjectId, count: finalExam ? 15 : Number(countSelect.value),
          difficulty: diffSelect.value, finalExam: finalExam
        });
        var exam = S.addExam(res.exam);
        ui.toast('Simulacro listo · ' + (res.model || 'A.T.L.A.S'));
        app.go('/simulacro/' + exam.id);
      } catch (e) {
        ui.mount(statusBox, ui.notice('danger', 'No se pudo generar el examen: ' + e.message));
      }
    }

    var generatorCard = el('section', { class: 'card' }, [
      el('div', { class: 'tool-icon' }, icon('i-spark')),
      el('h3', { text: 'Simulacro generado por IA' }),
      el('p', { class: 'small muted', text: 'Preguntas nuevas sobre ' + D.label(subjectId) + ' y tus apuntes, con explicaciones y respuesta correcta validada.' }),
      el('div', { class: 'grid grid-2', style: { marginTop: '.8rem' } }, [
        ui.field('Cantidad', countSelect), ui.field('Dificultad', diffSelect)
      ]),
      el('div', { style: { marginTop: '1rem' } }, ui.button('Generar y resolver', 'i-play', 'btn btn-primary btn-block', function () { generate(false); })),
      statusBox
    ]);

    var finalCard = el('section', { class: 'card' }, [
      el('div', { class: 'tool-icon' }, icon('i-shield')),
      el('h3', { text: 'Examen final de toda la materia' }),
      r ? el('p', { class: 'small muted', text: r.canFinal
          ? 'La IA considera que ya cumpliste el objetivo: ' + r.percent + '% de preparación, promedio ' + r.avg + '% y ' + r.notes + ' apuntes.'
          : 'Preparación: ' + r.percent + '%. Para habilitarlo necesitas ≥70%, promedio ≥75% en al menos 2 simulacros y 2 apuntes.' })
        : el('p', { class: 'small muted', text: 'Elige una materia concreta para evaluar si ya puedes rendir el examen final.' }),
      el('div', { style: { marginTop: '1rem' } }, (!r || r.canFinal)
        ? ui.button('Generar examen final (15 preguntas)', 'i-spark', 'btn btn-primary btn-block', function () { generate(true); })
        : el('button', { type: 'button', class: 'btn btn-block', disabled: true, title: 'Aún no cumples los criterios' }, 'Bloqueado por la IA · sigue estudiando'))
    ]);

    /* ---- Constructor de exámenes de la comunidad ---- */
    var builder = el('div', { class: 'col' });
    var qtyInput = el('input', { class: 'input', type: 'number', min: '3', max: String(C.LIMITS.maxQuestions), value: '3', 'aria-label': 'Cantidad de preguntas' });
    var titleInput = el('input', { class: 'input', placeholder: 'Título del examen', maxlength: C.LIMITS.maxTitle, 'aria-label': 'Título del examen' });
    var authorInput = el('input', { class: 'input', placeholder: 'Tu nombre', value: S.state.profile.name, 'aria-label': 'Autor' });
    function buildFields() {
      var n = ui.clamp(Number(qtyInput.value) || 3, 3, C.LIMITS.maxQuestions);
      qtyInput.value = String(n);
      ui.mount(builder, Array.from({ length: n }, function (_, i) {
        var q = el('input', { class: 'input pregunta-q', placeholder: 'Enunciado de la pregunta ' + (i + 1), maxlength: C.LIMITS.maxQuestion, 'aria-label': 'Pregunta ' + (i + 1) });
        var opts = Array.from({ length: 4 }, function (_, j) {
          return el('input', { class: 'input pregunta-o', placeholder: 'Opción ' + 'ABCD'[j], maxlength: C.LIMITS.maxOption, 'aria-label': 'Opción ' + 'ABCD'[j] });
        });
        var correct = el('select', { class: 'select pregunta-c', 'aria-label': 'Respuesta correcta' });
        ['A', 'B', 'C', 'D'].forEach(function (letter, j) { correct.appendChild(el('option', { value: String(j), text: 'Correcta: ' + letter })); });
        var explain = el('input', { class: 'input pregunta-e', placeholder: 'Explicación (opcional)', maxlength: '600', 'aria-label': 'Explicación' });
        return el('div', { class: 'builder-q col', dataset: { q: String(i) } }, [
          el('h4', { text: 'Pregunta ' + (i + 1) }),
          ui.field('Enunciado', q),
          el('div', { class: 'grid grid-2' }, opts.map(function (o, j) { return ui.field('Opción ' + 'ABCD'[j], o); })),
          el('div', { class: 'grid grid-2' }, [ui.field('Respuesta', correct), ui.field('Explicación', explain)])
        ]);
      }));
    }
    buildFields();

    var publishStatus = el('div', { class: 'col' });
    var importExamInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, 'aria-label': 'Importar examen' });
    importExamInput.addEventListener('change', function () {
      var f = importExamInput.files && importExamInput.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          var exam = S.normalizeExam(parsed.exam || parsed);
          if (!exam) throw new Error('sin preguntas válidas');
          exam.source = 'imported';
          S.addExam(exam); ui.toast('Examen importado: ' + exam.title); app.render();
        } catch (e) { ui.toast('Examen inválido: ' + e.message, 'err'); }
        importExamInput.value = '';
      };
      reader.readAsText(f);
    });

    var communityCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [el('span', { class: 'eyebrow', text: 'COMUNIDAD' }), el('h3', { text: 'Sube tu propio simulacro' })]),
        el('span', { class: 'badge ' + (A.isShared ? 'ok' : ''), text: A.isShared ? 'Se comparte con todos' : 'Se guarda en tu dispositivo' })
      ]),
      el('div', { class: 'grid grid-2' }, [
        ui.field('Título', titleInput), ui.field('Autor', authorInput),
        ui.field('Materia', app.subjectSelect(subjectId, function (v) { app.go('/examenes?materia=' + v); }, true))
      ]),
      el('div', { class: 'row', style: { marginTop: '.8rem' } }, [
        ui.field('Nº de preguntas', qtyInput),
        ui.button('Generar campos', 'i-refresh', 'btn btn-sm', buildFields)
      ]),
      builder,
      el('div', { class: 'row', style: { marginTop: '1rem' } }, [
        ui.button('Publicar examen', 'i-upload', 'btn btn-primary btn-sm', function () {
          var blocks = Array.prototype.slice.call(builder.querySelectorAll('.builder-q'));
          var questions = blocks.map(function (b) {
            var opts = Array.prototype.slice.call(b.querySelectorAll('.pregunta-o')).map(function (x) { return x.value.trim(); });
            return {
              q: b.querySelector('.pregunta-q').value.trim(), options: opts,
              correct: Number(b.querySelector('.pregunta-c').value),
              explain: b.querySelector('.pregunta-e').value.trim()
            };
          }).filter(function (q) { return q.q && q.options.every(function (o) { return o; }); });
          if (!titleInput.value.trim()) { ui.toast('Ponle un título al examen', 'warn'); return; }
          if (!questions.length || questions.length !== blocks.length) { ui.toast('Completa todas las preguntas y sus 4 opciones', 'warn'); return; }
          var exam = S.normalizeExam({
            title: titleInput.value.trim(), subjectId: subjectId === 'all' ? 'general' : subjectId,
            author: authorInput.value.trim() || 'Anónimo', source: 'community', questions: questions
          });
          ui.mount(publishStatus, ui.spinner('Publicando…'));
          A.publishExam(exam).then(function () {
            ui.mount(publishStatus, ui.notice('ok', 'Examen publicado. Ya aparece en la lista de la comunidad.'));
            ui.toast('Examen publicado'); loadList();
          }).catch(function (e) { ui.mount(publishStatus, ui.notice('danger', e.message)); });
        }),
        ui.button('Importar .json', 'i-upload', 'btn btn-sm', function () { importExamInput.click(); }),
        importExamInput
      ]),
      publishStatus
    ]);

    function loadList() {
      var local = S.state.exams.slice();
      A.listExams().then(function (shared) {
        var map = {};
        local.forEach(function (e) { map[e.id] = e; });
        shared.forEach(function (e) { if (!map[e.id]) map[e.id] = S.normalizeExam(e); });
        var all = Object.keys(map).map(function (k) { return map[k]; }).filter(Boolean)
          .filter(function (e) { return subjectId === 'general' || e.subjectId === subjectId || e.subjectId === 'all'; })
          .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
        ui.mount(listBox, all.length ? all.map(function (e) {
          return el('div', { class: 'exam-item' }, [
            el('div', { class: 'col', style: { gap: '.2rem', minWidth: '0' } }, [
              el('strong', { class: 'small', text: e.title }),
              el('span', { class: 'meta', text: D.label(e.subjectId) + ' · ' + e.questions.length + ' preguntas · ' + (e.author || 'Anónimo') + ' · ' + ui.fmtDate(e.createdAt) })
            ]),
            el('div', { class: 'row-tight' }, [
              el('span', { class: 'badge ' + (e.source === 'ai' ? 'accent' : e.source === 'local' ? 'warn' : 'info'), text: e.source === 'ai' ? 'IA ' + (e.model || '') : e.source === 'local' ? 'A.T.L.A.S' : 'Comunidad' }),
              ui.linkButton('Resolver', '#/simulacro/' + e.id, 'i-play', 'btn btn-sm btn-primary'),
              el('button', { type: 'button', class: 'btn btn-sm', title: 'Exportar examen', 'aria-label': 'Exportar ' + e.title, onclick: function () {
                S.download('examen_' + e.id + '.json', JSON.stringify({ app: 'A.T.L.A.S', exam: e }, null, 2), 'application/json');
                ui.toast('Examen exportado');
              } }, icon('i-download')),
              !A.isShared ? el('button', { type: 'button', class: 'btn btn-sm btn-danger', title: 'Eliminar', 'aria-label': 'Eliminar ' + e.title, onclick: function () {
                ui.confirm('Eliminar examen', '«' + e.title + '» se borrará de este dispositivo.', function () { S.removeExam(e.id); loadList(); });
              } }, icon('i-trash')) : null
            ])
          ]);
        }) : ui.empty('i-file', 'No hay exámenes todavía', 'Genera uno con IA, sube el tuyo o importa un archivo .json.'));
      }).catch(function () { ui.mount(listBox, ui.notice('danger', 'No se pudieron cargar los exámenes.')); });
    }
    loadList();

    var subjectPicker = app.subjectSelect(subjectId, function (v) { app.go('/examenes?materia=' + v); }, true);
    subjectPicker.style.maxWidth = '18rem';

    return [
      app.pageHeader({ eyebrow: 'EVALUACIÓN', title: 'Simulacros y comunidad', sub: 'Exámenes creados por la IA, por ti o por otros estudiantes. Cualquiera puede publicar y resolver.', back: subjectId === 'general' ? '/inicio' : '/materia/' + subjectId }),
      el('div', { class: 'row', style: { marginBottom: '1rem' } }, [
        el('span', { class: 'label', text: 'Materia' }), subjectPicker,
        el('span', { class: 'badge ok', text: 'Comunidad compartida' })
      ]),
      el('div', { class: 'grid grid-2' }, [generatorCard, finalCard]),
      el('div', { class: 'section' }, [app.sectionTitle('Exámenes disponibles'), el('section', { class: 'card' }, listBox)]),
      el('div', { class: 'section' }, communityCard)
    ];
  });

  /* ======================= JUGADOR DE SIMULACRO ======================= */
  app.register('/simulacro/:id', function (params, parts) {
    var id = parts[1];
    var holder = el('div', { class: 'col' }, ui.spinner('Cargando examen…'));

    function findExam() {
      var local = S.state.exams.find(function (e) { return e.id === id; });
      if (local) return Promise.resolve(local);
      return A.listExams().then(function (list) {
        var found = list.find(function (e) { return e.id === id || String(e.id) === String(id); });
        return found ? S.normalizeExam(found) : null;
      });
    }

    findExam().then(function (exam) {
      if (!exam) { ui.mount(holder, ui.empty('i-file', 'Examen no encontrado', 'Puede que se haya eliminado. Vuelve a la lista de simulacros.')); return; }
      var answers = new Array(exam.questions.length).fill(null);
      var index = 0;
      var finished = false;
      var savedResult = false;

      function renderQuiz() {
        if (finished) return renderResult();
        var q = exam.questions[index];
        var optionsBox = el('div', { class: 'options' }, q.options.map(function (o, i) {
          return el('button', { type: 'button', class: 'option' + (answers[index] === i ? ' selected' : ''), 'aria-pressed': answers[index] === i ? 'true' : 'false',
            onclick: function () { answers[index] = i; renderQuiz(); } }, [
            el('span', { class: 'option-letter', text: 'ABCD'[i] }), el('span', { text: o })
          ]);
        }));
        ui.mount(holder, [
          el('div', { class: 'quiz-head' }, [
            el('div', { class: 'col', style: { gap: '.2rem' } }, [
              el('span', { class: 'eyebrow', text: D.label(exam.subjectId).toUpperCase() }),
              el('h2', { text: exam.title })
            ]),
            el('span', { class: 'badge accent', text: (index + 1) + ' / ' + exam.questions.length })
          ]),
          ui.progressBar(((index + 1) / exam.questions.length) * 100),
          el('p', { class: 'quiz-q', text: q.q }),
          optionsBox,
          el('div', { class: 'quiz-footer' }, [
            el('button', { type: 'button', class: 'btn btn-sm', disabled: index === 0, onclick: function () { index--; renderQuiz(); } }, [icon('i-back'), el('span', { text: 'Anterior' })]),
            el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: function () {
              if (answers[index] == null) { ui.toast('Elige una opción antes de continuar', 'warn'); return; }
              if (index < exam.questions.length - 1) { index++; renderQuiz(); }
              else { finished = true; renderResult(); }
            } }, [el('span', { text: index === exam.questions.length - 1 ? 'Finalizar y ver resultado' : 'Siguiente' }), icon('i-arrow')])
          ]),
          el('div', { class: 'row' }, [
            el('span', { class: 'tiny faint', text: 'Origen: ' + (exam.source === 'ai' ? 'IA ' + (exam.model || '') : exam.source === 'local' ? 'A.T.L.A.S' : 'comunidad') }),
            el('span', { class: 'spacer' }),
            ui.linkButton('Salir', '#/examenes?materia=' + exam.subjectId, null, 'btn btn-sm btn-ghost')
          ])
        ]);
      }

      function renderResult() {
        var correct = answers.reduce(function (a, ans, i) { return a + (ans === exam.questions[i].correct ? 1 : 0); }, 0);
        var percent = Math.round((correct / exam.questions.length) * 100);
        if (!savedResult) {
          savedResult = true;
          S.addResult({ examId: exam.id, subjectId: exam.subjectId, correct: correct, total: exam.questions.length, source: exam.source });
        }
        var ring = el('div', { class: 'score-ring' }, el('span', { text: percent + '%' }));
        ring.style.setProperty('--p', percent + '%');
        var review = el('div', { class: 'col' }, exam.questions.map(function (q, i) {
          var ok = answers[i] === q.correct;
          var expl = el('div', { class: 'col' });
          if (q.explain) expl.appendChild(el('div', { class: 'explanation' }, ui.markdown(q.explain)));
          var aiBtn = el('button', { type: 'button', class: 'btn btn-sm', onclick: function () {
            var target = el('div', { class: 'col' }, ui.spinner('Pidiendo explicación al modelo…'));
            expl.appendChild(target); aiBtn.disabled = true;
            ai.explain({
              subjectId: exam.subjectId, q: q.q,
              correctText: q.options[q.correct], chosenText: answers[i] == null ? '' : q.options[answers[i]],
              fallback: q.explain || 'Revisa este tema en tus apuntes.'
            }).then(function (r) {
              ui.mount(target, [el('div', { class: 'explanation' }, ui.markdown(r.text)), app.engineBadge(r.engine, ai.status().model)]);
            });
          } }, [icon('i-spark'), el('span', { text: 'Explicación de la IA' })]);
          return el('div', { class: 'card soft' }, [
            el('div', { class: 'row-tight' }, [
              el('span', { class: 'badge ' + (ok ? 'ok' : 'danger'), text: ok ? 'Correcta' : 'Incorrecta' }),
              el('strong', { class: 'small', text: 'Pregunta ' + (i + 1) })
            ]),
            el('p', { class: 'small', style: { marginTop: '.5rem' }, text: q.q }),
            el('p', { class: 'small' }, [el('strong', { text: 'Tu respuesta: ' }), el('span', { text: answers[i] == null ? 'sin responder' : q.options[answers[i]] })]),
            el('p', { class: 'small' }, [el('strong', { text: 'Correcta: ' }), el('span', { text: q.options[q.correct] })]),
            expl, el('div', { style: { marginTop: '.6rem' } }, aiBtn)
          ]);
        }));
        ui.mount(holder, [
          el('section', { class: 'card result' }, [
            ring,
            el('h2', { text: percent >= 75 ? '¡Objetivo alcanzado!' : percent >= 50 ? 'Buen avance, sigue practicando' : 'Toca reforzar esta materia' }),
            el('p', { class: 'muted', text: correct + ' de ' + exam.questions.length + ' respuestas correctas · ' + percent + '%' }),
            el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1rem' } }, [
              el('button', { type: 'button', class: 'btn btn-sm', onclick: function () { answers.fill(null); index = 0; finished = false; savedResult = false; renderQuiz(); } }, [icon('i-refresh'), el('span', { text: 'Repetir' })]),
              ui.linkButton('Ver progreso', '#/progreso', 'i-chart', 'btn btn-sm btn-primary'),
              ui.linkButton('Más simulacros', '#/examenes?materia=' + exam.subjectId, 'i-arrow', 'btn btn-sm')
            ])
          ]),
          el('div', { class: 'col' }, [el('h3', { text: 'Revisión detallada' }), review])
        ]);
      }
      renderQuiz();
    }).catch(function (e) { ui.mount(holder, ui.notice('danger', 'Error al cargar el examen: ' + e.message)); });

    return [app.pageHeader({ eyebrow: 'SIMULACRO', title: 'Examen en curso', back: '/examenes' }), holder];
  });
})(window);
