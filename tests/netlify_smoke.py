#!/usr/bin/env python3
"""Pruebas de la edición Netlify con IA real.
Requiere el servidor de vista previa con GEMINI_API_KEY definida:
    GEMINI_API_KEY=xxx PORT=4173 node server/dev.mjs
"""
import os
import sys
import urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get('ATLAS_URL', 'http://127.0.0.1:4173/')
OK, FAIL = [], []


def ck(name, cond, detail=''):
    (OK if cond else FAIL).append((name, detail))
    print(('  ✅ ' if cond else '  ❌ ') + name + ((' · ' + str(detail)) if detail else ''))


def nav(pg, h):
    pg.goto(BASE + h, wait_until='domcontentloaded')
    pg.wait_for_timeout(350)


def api(path):
    with urllib.request.urlopen(BASE.rstrip('/') + path, timeout=10) as r:
        return r.status, r.read().decode('utf-8')


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}, locale='es-BO', accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        pg.on('response', lambda r: errs.append('HTTP %d %s' % (r.status, r.url)) if r.status >= 400 else None)

        print('\n[1] Arranque y limpieza de interfaz')
        nav(pg, '#/inicio')
        ck('cabecera muestra «IA activa»', pg.locator('#ai-status').inner_text() == 'IA activa')
        ck('backend conectado', pg.evaluate('ATLAS.adapters.mode') == 'node')
        ck('IA real por proxy', pg.evaluate('ATLAS.ai.status().mode') == 'proxy')
        body = pg.locator('body').inner_text().lower()
        for phrase in ('sin ia', 'sin conexión', 'sin servidor', 'motor local', 'sin clave'):
            ck('sin texto «%s»' % phrase, phrase not in body)
        ck('sin Google Sign-In', 'google sign' not in body and 'continuar con google' not in body)
        ck('3 accesos directos', pg.locator('.quick-card').count() == 3)
        ck('un solo H1', pg.locator('h1').count() == 1)
        ck('iconos correctos', pg.evaluate("[...document.querySelectorAll('svg use')].filter(u=>!document.querySelector(u.getAttribute('href'))).length") == 0)

        print('\n[2] IA REAL en el chat')
        ta = pg.locator('#view .chat textarea').first
        ta.fill('Explica en una frase qué es la gastrulación.')
        ta.press('Enter')
        for _ in range(80):
            if pg.locator('.typing').count() == 0 and pg.locator('#view .chat-msg .chat-bubble').count() >= 3:
                break
            pg.wait_for_timeout(500)
        answer = pg.locator('#view .chat-msg .chat-bubble').last.inner_text()
        ck('respuesta del modelo no vacía', len(answer.strip()) > 40, answer[:70])
        ck('etiqueta del modelo', 'gemini' in answer.lower())
        ck('no es respuesta local', 'motor local' not in answer.lower())

        print('\n[3] IA REAL generando simulacro')
        nav(pg, '#/examenes?materia=anatomia1')
        pg.get_by_role('button', name='Generar y resolver').click()
        pg.wait_for_selector('.quiz-q', timeout=90000)
        ck('examen con 4 opciones', pg.locator('.option').count() == 4)
        ck('título de simulacro IA', 'Simulacro IA' in pg.locator('#view').inner_text())
        for _ in range(12):
            if not pg.locator('.quiz-footer .btn-primary').count():
                break
            pg.locator('.option').first.click()
            pg.locator('.quiz-footer .btn-primary').click()
        ck('resultado guardado', pg.locator('.result').count() == 1)

        print('\n[4] Comunidad y cuenta contra la API de Netlify')
        nav(pg, '#/ajustes')
        pg.get_by_role('button', name='Probar conexión').click()
        pg.wait_for_timeout(6000)
        ck('prueba de conexión real', 'Conexión real verificada' in pg.locator('#view').inner_text())
        pg.locator('input[type=email]').fill('presentacion@atlas.com')
        pg.get_by_role('button', name='Guardar cuenta').click()
        pg.get_by_role('button', name='Sincronizar ahora').click()
        pg.wait_for_timeout(700)
        st, data = api('/api/progress?email=presentacion@atlas.com')
        ck('progreso persistido', st == 200 and 'presentacion@atlas.com' in data)
        pg.locator('textarea').last.fill('Opinión de prueba de entrega')
        pg.get_by_role('button', name='Publicar opinión').click()
        pg.wait_for_timeout(700)
        _, ops = api('/api/opinions')
        ck('opinión compartida', 'Opinión de prueba de entrega' in ops)

        print('\n[5] Modo demostración y diseño')
        pg.get_by_role('button', name='Cargar datos de demostración').click()
        nav(pg, '#/progreso')
        pg.wait_for_timeout(2500)
        ck('veredicto de la IA visible', pg.locator('.advice h2').count() == 1, pg.locator('.advice h2').inner_text()[:60])
        ck('dashboard con datos reales de la demo', '240' in pg.locator('.stat-grid').inner_text() and pg.locator('.stat').count() >= 6)
        nav(pg, '#/ajustes')
        pg.get_by_role('button', name='Quitar datos de demostración').click()
        ck('demo se puede quitar', pg.evaluate('ATLAS.store.state.demo') is False)

        print('\n[6] Responsive y temas')
        for w in (320, 375, 768, 1280):
            pg.set_viewport_size({'width': w, 'height': 820})
            nav(pg, '#/inicio')
            sw = pg.evaluate('document.documentElement.scrollWidth')
            ck('%dpx sin overflow' % w, sw <= w + 1, sw)
        pg.set_viewport_size({'width': 1280, 'height': 900})
        nav(pg, '#/inicio')
        seen = set()
        for _ in range(6):
            seen.add(pg.evaluate('document.documentElement.getAttribute("data-theme")'))
            pg.locator('#quick-theme').click()
            pg.wait_for_timeout(70)
        ck('5 temas', {'light', 'dark', 'green', 'violet', 'blue'}.issubset(seen))

        print('\n[7] Consola limpia')
        ck('cero errores de JS/red', not errs, errs[:6])

        b.close()

    print('\n' + '=' * 60)
    print('RESULTADO: %d OK / %d fallos' % (len(OK), len(FAIL)))
    if FAIL:
        for n, d in FAIL:
            print('  ❌', n, d)
        sys.exit(1)
    print('Edición Netlify: todas las pruebas pasaron.')


if __name__ == '__main__':
    main()
