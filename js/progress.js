/* =========================================================================
   Progreso REAL: sesiones cronometradas, resultados de exámenes y apuntes.
   El veredicto (descansar / estudiar / examen final) sale de estos datos;
   la IA solo lo redacta y explica, nunca lo inventa.
   ========================================================================= */
(function (global) {
  'use strict';

  var S = global.ATLAS.store;
  var D = global.ATLAS.data;
  var ui = global.ATLAS.ui;

  var timer = { running: false, startedAt: null, subjectId: '', accumulatedMs: 0 };
  var tickers = [];

  function dayKey(d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d; }

  function stats() {
    var st = S.state;
    var today = dayKey(new Date());
    var weekStart = daysAgo(6).getTime();
    var minutesToday = 0, minutes7 = 0;
    var byDay = {};
    st.sessions.forEach(function (s) {
      var t = new Date(s.ts).getTime();
      if (isNaN(t)) return;
      var k = dayKey(s.ts);
      byDay[k] = (byDay[k] || 0) + s.minutes;
      if (k === today) minutesToday += s.minutes;
      if (t >= weekStart) minutes7 += s.minutes;
    });
    var streak = 0;
    for (var i = 0; i < 60; i++) {
      var k = dayKey(daysAgo(i));
      if (byDay[k] > 0) streak++;
      else if (i === 0) continue; /* hoy aún puede empezar */
      else break;
    }
    var recent = st.results.slice(-10);
    var avgScore = recent.length ? Math.round(recent.reduce(function (a, r) { return a + (r.correct / Math.max(1, r.total)) * 100; }, 0) / recent.length) : null;
    var per = {};
    D.subjects.forEach(function (sub) { per[sub.id] = { minutes: 0, notes: 0, results: [], avg: null }; });
    st.sessions.forEach(function (s) { if (per[s.subjectId]) per[s.subjectId].minutes += s.minutes; });
    st.notes.forEach(function (n) { if (per[n.subjectId]) per[n.subjectId].notes++; else if (n.subjectId === 'general') {} });
    st.results.forEach(function (r) { if (per[r.subjectId]) per[r.subjectId].results.push(r); });
    Object.keys(per).forEach(function (k) {
      var rs = per[k].results.slice(-5);
      per[k].avg = rs.length ? Math.round(rs.reduce(function (a, r) { return a + (r.correct / Math.max(1, r.total)) * 100; }, 0) / rs.length) : null;
    });
    return {
      minutesToday: Math.round(minutesToday * 10) / 10,
      minutes7: Math.round(minutes7 * 10) / 10,
      streak: streak,
      sessionsCount: st.sessions.length,
      notesCount: st.notes.length,
      resultsCount: st.results.length,
      avgScore: avgScore,
      lastResult: st.results.length ? st.results[st.results.length - 1] : null,
      byDay: byDay,
      perSubject: per
    };
  }

  function readiness(subjectId) {
    var st = stats(), p = st.perSubject[subjectId];
    if (!p) return { percent: 0, level: 'Sin datos', canFinal: false };
    var minutesScore = Math.min(40, (p.minutes / 180) * 40);
    var notesScore = Math.min(25, (p.notes / 4) * 25);
    var quizScore = p.avg == null ? 0 : Math.min(35, (p.avg / 100) * 35);
    var percent = Math.round(minutesScore + notesScore + quizScore);
    var canFinal = percent >= 70 && p.avg != null && p.avg >= 75 && p.results.length >= 2 && p.notes >= 2;
    var level = percent >= 80 ? 'Listo para examen final' : percent >= 50 ? 'Avance sólido' : percent >= 20 ? 'En progreso' : 'Recién empieza';
    return { percent: percent, level: level, canFinal: canFinal, minutes: p.minutes, notes: p.notes, avg: p.avg, exams: p.results.length };
  }

  function decision() {
    var s = stats();
    var ready = D.subjects.map(function (x) { return { subject: x, r: readiness(x.id) }; })
      .filter(function (x) { return x.r.canFinal; })
      .sort(function (a, b) { return b.r.percent - a.r.percent; });
    if (s.minutesToday >= 180) {
      return { action: 'descansar', title: 'Tu cuerpo pide un descanso',
        message: 'Ya registraste **' + s.minutesToday + ' minutos hoy** y ' + s.minutes7 + ' min en los últimos 7 días. Una pausa y una buena noche de sueño consolidan lo estudiado.',
        reason: '≥180 min hoy' };
    }
    if (s.streak >= 6 && s.minutes7 >= 900) {
      return { action: 'descansar', title: 'Racha intensa: baja el ritmo',
        message: 'Llevas **' + s.streak + ' días consecutivos** y ' + s.minutes7 + ' min esta semana. Alterna con descanso para evitar fatiga.',
        reason: 'racha ≥6 y ≥15 h semanales' };
    }
    if (s.avgScore != null && s.avgScore < 60) {
      return { action: 'estudiar', title: 'Conviene reforzar antes de avanzar',
        message: 'Tu promedio en los últimos exámenes es **' + s.avgScore + '%**. Repasa los temas fallidos, escribe apuntes y vuelve a intentar un simulacro corto.',
        reason: 'promedio <60%' };
    }
    if (s.minutes7 < 120) {
      return { action: 'estudiar', title: 'Necesitas más horas de estudio',
        message: 'Esta semana registraste **' + s.minutes7 + ' minutos**. Empieza una sesión cronometrada de 25 minutos y toma apuntes de la materia activa.',
        reason: '<120 min en 7 días' };
    }
    if (ready.length) {
      var r = ready[0];
      return { action: 'examen', title: 'Ya puedes rendir el examen final de ' + r.subject.name,
        message: 'Con **' + r.r.percent + '% de preparación**, ' + r.r.notes + ' apuntes y promedio de ' + r.r.avg + '% en simulacros, cumples los criterios. Genera el examen final de toda la materia y comprueba tu objetivo.',
        reason: 'preparación ≥70% y promedio ≥75%', subjectId: r.subject.id };
    }
    return { action: 'seguir', title: 'Vas bien, sigue avanzando',
      message: 'Llevas **' + s.minutes7 + ' min esta semana**, ' + s.notesCount + ' apuntes y ' + s.resultsCount + ' simulacros. Aún falta algo de práctica para el examen final de una materia completa.',
      reason: 'progreso intermedio' };
  }

  function adviceText() {
    var d = decision();
    return global.ATLAS.ai.advise({
      minutesToday: stats().minutesToday, minutes7: stats().minutes7,
      streak: stats().streak, notes: stats().notesCount,
      exams: stats().resultsCount, avgScore: stats().avgScore,
      perSubject: Object.keys(stats().perSubject).map(function (k) {
        return { subject: k, readiness: readiness(k).percent, canFinal: readiness(k).canFinal };
      })
    }, d);
  }

  /* ---------- cronómetro de estudio ---------- */
  function elapsedMs() { return timer.accumulatedMs + (timer.running ? Date.now() - timer.startedAt : 0); }
  function elapsedMinutes() { return elapsedMs() / 60000; }
  function startTimer(subjectId) {
    if (timer.running) return;
    timer.running = true; timer.startedAt = Date.now();
    timer.subjectId = subjectId || timer.subjectId || '';
    notify();
  }
  function pauseTimer() {
    if (!timer.running) return;
    timer.accumulatedMs += Date.now() - timer.startedAt;
    timer.running = false; timer.startedAt = null; notify();
  }
  function stopTimer() {
    if (timer.running) pauseTimer();
    var minutes = elapsedMinutes();
    var subjectId = timer.subjectId;
    timer.accumulatedMs = 0; timer.subjectId = '';
    notify();
    if (minutes >= 0.5) return S.addSession(minutes, subjectId, 'timer');
    return null;
  }
  function resetTimer() { timer.running = false; timer.startedAt = null; timer.accumulatedMs = 0; notify(); }
  function notify() { tickers.forEach(function (f) { try { f(timer, elapsedMs()); } catch (e) {} }); }
  function onTick(fn) { tickers.push(fn); return function () { tickers = tickers.filter(function (x) { return x !== fn; }); }; }
  function formatElapsed(ms) {
    var total = Math.floor(ms / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
    return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  global.ATLAS = global.ATLAS || {};
  global.ATLAS.progress = {
    stats: stats, readiness: readiness, decision: decision, adviceText: adviceText,
    startTimer: startTimer, pauseTimer: pauseTimer, stopTimer: stopTimer,
    resetTimer: resetTimer, elapsedMs: elapsedMs, formatElapsed: formatElapsed,
    onTick: onTick, get timer() { return timer; }
  };
})(window);
