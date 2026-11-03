/* Aplica el tema guardado antes de pintar (sin script inline: compatible con CSP). */
(function () {
  'use strict';
  var t = 'light';
  try {
    var raw = localStorage.getItem('atlas.v2');
    var saved = localStorage.getItem('atlas.v2.theme');
    if (!saved && raw) {
      var obj = JSON.parse(raw);
      saved = obj && obj.theme;
    }
    if (['light', 'dark', 'green', 'violet', 'blue'].indexOf(saved) >= 0) t = saved;
    else if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
  } catch (e) { t = 'light'; }
  document.documentElement.setAttribute('data-theme', t);
})();
