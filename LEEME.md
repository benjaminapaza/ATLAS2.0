# A.T.L.A.S · Edición Netlify

Versión final para publicar en **Netlify**, con **IA real ya integrada** y comunidad compartida.

| Archivo | Para qué sirve |
|---|---|
| **`netlify.toml`**, **`package.json`**, **`netlify/functions/api.mjs`**, **`api/handler.mjs`** | Configuración de Netlify y función serverless que sirve `/api/*` |
| **`index.html`**, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js` | La aplicación |
| **`DESPLEGAR-NETLIFY.md`** | ⭐ Instrucciones exactas para publicarla |
| **`PRESENTACION.md`** | Dossier para la empresa y guion de demo |
| **`capturas/`** | 6 imágenes de la interfaz |
| **`tests/netlify_smoke.py`** | 30 pruebas automatizadas |
| **`server/dev.mjs`** | Vista previa local (`npm run dev`) |

## Un solo paso que solo tú puedes hacer

La clave de Gemini **no está dentro del ZIP** (si estuviera, cualquier visitante podría copiarla y gastar tu cuota). Se configura una vez en Netlify:

**Site configuration → Environment variables → Add a variable**
- Key: `GEMINI_API_KEY`
- Value: la clave que me enviaste (empieza por `AQ.Ab8…`)

Con eso la IA queda activa para todos los visitantes, sin que la clave aparezca nunca en el navegador. Instrucciones completas en `DESPLEGAR-NETLIFY.md`.

## Estado

- ✅ IA real en el chat, simulacros, resúmenes y veredicto de progreso (Gemini vía función serverless).
- ✅ Comunidad y progreso persistentes entre usuarios (Netlify Blobs).
- ✅ Sin inicio de sesión con Google (eliminado por completo).
- ✅ Sin avisos de «sin IA», «sin conexión» ni texto de desarrollo en la interfaz.
- ✅ Diseño simplificado: menos texto, accesos directos, botones más grandes, 5 temas.
- ✅ 30 pruebas automatizadas: 0 fallos, 0 errores de consola, sin desbordes de 320 a 1280 px.

Para verla en local sin Netlify:
```bash
npm install
GEMINI_API_KEY=tu_clave npm run dev
# http://localhost:4173
```
