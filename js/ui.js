/* =========================================================================
   Utilidades de interfaz. Regla de oro: NUNCA innerHTML con datos de usuario,
   apuntes, exámenes de la comunidad ni respuestas de la IA.
   ========================================================================= */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = String(v);
        else if (k === 'html') throw new Error('ui.el: html está prohibido por seguridad');
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === 'for') node.htmlFor = v;
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') node[k] = !!v;
        else node.setAttribute(k, String(v));
      });
    }
    append(node, children);
    return node;
  }

  function append(parent, children) {
    if (children == null || children === false) return parent;
    if (Array.isArray(children)) { children.forEach(function (c) { append(parent, c); }); return parent; }
    if (children instanceof Node) { parent.appendChild(children); return parent; }
    parent.appendChild(document.createTextNode(String(children)));
    return parent;
  }

  function icon(name, cls) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', cls || '');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    var use = document.createElementNS(SVG_NS, 'use');
    /* Acepta tanto 'send' como 'i-send' (el sprite usa ids con prefijo i-). */
    var id = String(name).indexOf('i-') === 0 ? String(name) : 'i-' + name;
    use.setAttribute('href', '#' + id);
    use.setAttribute('xlink:href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(node, children) { return append(clear(node), children); }

  /* Markdown mínimo y SEGURO: **negrita**, saltos de línea y listas. */
  function markdown(text) {
    var frag = document.createDocumentFragment();
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) { frag.appendChild(document.createElement('br')); return; }
      var li = null;
      if (/^[-*]\s+/.test(trimmed)) {
        li = document.createElement('div');
        li.className = 'md-li';
        li.style.paddingLeft = '1rem';
        li.style.position = 'relative';
        var bullet = document.createElement('span');
        bullet.textContent = '•';
        bullet.style.position = 'absolute';
        bullet.style.left = '0';
        li.appendChild(bullet);
        trimmed = trimmed.replace(/^[-*]\s+/, '');
      }
      var target = li || frag;
      var parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          var strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          target.appendChild(strong);
        } else {
          target.appendChild(document.createTextNode(part));
        }
      });
      if (li) frag.appendChild(li);
      else frag.appendChild(document.createElement('br'));
    });
    /* Quita el último <br> sobrante. */
    if (frag.lastChild && frag.lastChild.nodeName === 'BR') frag.removeChild(frag.lastChild);
    return frag;
  }

  function toast(message, type, ms) {
    var stack = document.getElementById('toasts');
    if (!stack) return;
    var ic = type === 'err' ? 'i-close' : type === 'warn' ? 'i-light' : 'i-check';
    var node = el('div', { class: 'toast ' + (type || 'ok'), role: 'status' }, [icon(ic), el('span', { text: message })]);
    stack.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0'; node.style.transform = 'translateY(8px)';
      node.style.transition = 'opacity .25s, transform .25s';
      setTimeout(function () { if (node.parentNode) node.remove(); }, 260);
    }, ms || 4200);
  }

  var openModal = null;
  function modal(opts) {
    closeModal();
    var root = document.getElementById('modal-root');
    var previous = document.activeElement;
    var body = el('div', { class: 'modal-body' });
    append(body, opts.body);
    var foot = el('div', { class: 'modal-foot' });
    (opts.actions || [{ label: 'Cerrar', kind: 'btn' }]).forEach(function (a) {
      foot.appendChild(el('button', {
        type: 'button', class: 'btn ' + (a.kind || 'btn'), onclick: function () {
          if (a.onClick) a.onClick();
          if (a.keepOpen !== true) closeModal();
        }
      }, a.label));
    });
    var card = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Diálogo' }, [
      el('div', { class: 'modal-head' }, [
        el('h2', { text: opts.title || 'Diálogo' }),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar diálogo', onclick: function () { closeModal(); } }, icon('i-close'))
      ]), body, foot
    ]);
    var overlay = el('div', { class: 'modal-overlay', onclick: function (e) { if (e.target === overlay) closeModal(); } }, card);
    root.appendChild(overlay);
    openModal = { overlay: overlay, previous: previous };
    var focusable = card.querySelector('input, textarea, select, button');
    if (focusable) focusable.focus();
    /* Atrapa el foco dentro del diálogo. */
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      var list = Array.prototype.slice.call(card.querySelectorAll('button, input, textarea, select, a[href]')).filter(function (x) { return !x.disabled; });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return { close: closeModal, body: body };
  }

  function closeModal() {
    if (!openModal) return;
    var o = openModal; openModal = null;
    if (o.overlay.parentNode) o.overlay.remove();
    if (o.previous && o.previous.focus) o.previous.focus();
  }

  function confirmDialog(title, message, onYes) {
    return modal({
      title: title,
      body: el('p', { class: 'muted', text: message }),
      actions: [
        { label: 'Cancelar', kind: 'btn' },
        { label: 'Confirmar', kind: 'btn-primary', onClick: onYes }
      ]
    });
  }

  function spinner(text) { return el('div', { class: 'row' }, [el('span', { class: 'spinner' }), el('span', { class: 'small muted', text: text || 'Procesando…' })]); }
  function empty(iconName, title, text) {
    return el('div', { class: 'empty' }, [icon(iconName), el('h3', { text: title }), el('p', { class: 'small', text: text })]);
  }
  function notice(kind, text, iconName) {
    return el('div', { class: 'notice ' + (kind || '') }, [icon(iconName || (kind === 'danger' ? 'i-shield' : 'i-light')), el('span', {}, markdown(text))]);
  }
  function field(labelText, control, helpText) {
    return el('label', { class: 'field' }, [
      el('span', { class: 'label', text: labelText }), control,
      helpText ? el('span', { class: 'help', text: helpText }) : null
    ]);
  }
  function button(label, iconName, kind, onClick, extra) {
    return el('button', Object.assign({ type: 'button', class: 'btn ' + (kind || ''), onclick: onClick }, extra || {}),
      [iconName ? icon(iconName) : null, el('span', { text: label })]);
  }
  function linkButton(label, href, iconName, kind) {
    return el('a', { class: 'btn ' + (kind || ''), href: href }, [iconName ? icon(iconName) : null, el('span', { text: label })]);
  }
  function progressBar(percent) {
    return el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(percent), 'aria-valuemin': '0', 'aria-valuemax': '100' },
      el('div', { class: 'progress-fill', style: { width: Math.max(0, Math.min(100, percent)) + '%' } }));
  }
  function stat(value, caption) { return el('div', { class: 'stat' }, [el('span', { class: 'value mono', text: value }), el('span', { class: 'caption', text: caption })]); }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  global.ATLAS = global.ATLAS || {};
  global.ATLAS.ui = {
    el: el, icon: icon, append: append, clear: clear, mount: mount, markdown: markdown,
    toast: toast, modal: modal, closeModal: closeModal, confirm: confirmDialog,
    spinner: spinner, empty: empty, notice: notice, field: field, button: button,
    linkButton: linkButton, progressBar: progressBar, stat: stat,
    fmtDate: fmtDate, fmtTime: fmtTime, debounce: debounce, clamp: clamp
  };
})(window);
