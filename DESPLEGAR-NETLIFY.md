# Publicar A.T.L.A.S en Netlify

La carpeta ya es un sitio Netlify completo: `netlify.toml`, la función serverless y el `package.json` están listos. **No hay que compilar nada** y **no hay que pegar la clave en ningún archivo**.

---

## Paso 1 · Sube los archivos (elige una)

**Opción A — Desde Git (la recomendada, necesaria para las funciones)**
1. Crea un repositorio en GitHub/GitLab con **todo el contenido de esta carpeta**.
2. En Netlify: **Add new site → Import an existing project** → conecta el repositorio.
3. Netlify detecta `netlify.toml` solo. *Build command* se queda vacío, *Publish directory* es `.`.
4. Pulsa **Deploy site**.

**Opción B — Desde la terminal (Netlify CLI)**
```bash
npm install -g netlify-cli
netlify login
netlify init      # elige "Create & configure a new site"
netlify deploy --prod
```

> ⚠️ **Netlify Drop (arrastrar la carpeta a la web) NO sirve aquí.** Ese modo solo publica archivos estáticos: no instala dependencias, no crea la función `/api` y no lee variables de entorno. La IA y la comunidad no funcionarían. Usa Git o la CLI.

---

## Paso 2 · Pon la clave (30 segundos, una sola vez)

En el panel de Netlify:
**Site configuration → Environment variables → Add a variable → Add single variable**

| Key | Value |
|---|---|
| `GEMINI_API_KEY` | la clave que me enviaste (empieza por `AQ.Ab8…`) |

Ámbito: **All scopes** (Production, Deploy Previews y Branch deploys). Guarda y haz **Trigger deploy → Deploy site** para que la función la lea.

**Por qué se hace así:** la clave se queda en el servidor de Netlify. El navegador solo llama a `/api/ai/generate`; nunca ve la clave. Si la pusiéramos dentro del `index.html` o del ZIP, cualquiera podría abrir el código, copiarla y consumir tu cuota.

Opcional, si prefieres OpenAI en vez de Gemini: añade `OPENAI_API_KEY` y cambia el proveedor en **Ajustes → Inteligencia Artificial**.

---

## Paso 3 · Comprueba que quedó viva

Abre tu URL de Netlify y verifica:

1. Arriba a la derecha dice **«IA activa»** con punto verde.
2. En **Inicio**, escribe una pregunta en el chat → aparece una respuesta real con la etiqueta `gemini-3.5-flash-lite` (o el modelo elegido).
3. **Simulacros → Generar y resolver** → preguntas nuevas, no las de plantilla.
4. **Ajustes → Probar conexión** → «Conexión real verificada».
5. Publica una opinión y abre la página en otro navegador: debe aparecer (está en Netlify Blobs, compartida entre usuarios).

Si el punto no se pone verde, revisa que la variable se llame exactamente `GEMINI_API_KEY` y que hayas redesplegado después de guardarla.

---

## Cómo está construido

```
petición del navegador  →  /api/*  →  netlify/functions/api.mjs  →  api/handler.mjs
                                                                   ├─ Gemini / OpenAI (clave de entorno)
                                                                   └─ Netlify Blobs (exámenes, opiniones, progreso)
```

- `netlify.toml` redirige `/api/*` a la función y sirve `index.html` para cualquier otra ruta (el router usa `#/…`, así que no hay 404 al recargar).
- La función es **stateless**; los datos compartidos se guardan en **Netlify Blobs** mediante `@netlify/blobs` (se instala solo en Netlify). Si Blobs no está disponible, usa memoria como respaldo.
- `NODE_VERSION = 22` en `netlify.toml`.
- La app funciona también sin la función (modo local honesto), pero la comunidad no se comparte.

---

## Modelos y fiabilidad

El modelo por defecto es **Gemini 3.5 Flash-Lite**, verificado con tu clave como disponible y estable. `gemini-3.8-flash` devolvió 503 por alta demanda y `gemini-4-argon` 429 por cuota con esta cuenta, por eso no son los predeterminados; siguen seleccionables en Ajustes. Si el modelo principal falla por cuota o demanda, la función reintenta automáticamente con `gemini-3.1-flash-lite`. Si la respuesta JSON de un simulacro sale malformada, se reintenta con formato estricto antes de usar cualquier respaldo.

---

## Solución de problemas

| Síntoma | Causa | Arreglo |
|---|---|---|
| La página abre pero dice «Asistente» | Falta la variable o no se redesplegó | Añade `GEMINI_API_KEY` y haz *Deploy site* |
| Error 404 en `/api/health` | Se publicó con Netlify Drop | Redeploy desde Git o CLI |
| «El modelo no respondió» | Cuota/red temporal | Reintentar; la función ya usa modelo de respaldo |
| Las opiniones no se comparten | Blobs sin inicializar | Comprueba el log de la función; el primer deploy crea el store `atlas` |
| La clave aparece en el código | — | No debe aparecer: solo existe como variable de entorno |

---

## Seguridad

- Sin CDNs, sin scripts de terceros, CSP estricta (`script-src 'self'`).
- Sin `innerHTML` con datos de usuario; exámenes y opiniones se validan en la función.
- Sin inicio de sesión con Google: el correo es solo un identificador para sincronizar progreso, y la interfaz no finge otra cosa.
- La función valida el modelo antes de llamar al proveedor; no acepta endpoints arbitrarios.
