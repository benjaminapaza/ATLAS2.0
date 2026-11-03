# A.T.L.A.S · Dossier de presentación

**Análisis y Tutoría Lógica Adaptativa Superior** · Edición Netlify v2.1
Plataforma de estudio para estudiantes de medicina de primer y segundo semestre.

> **Una frase:** convierte apuntes sueltos y horas de estudio en un profesor que conoce la materia, exámenes nuevos bajo demanda y una decisión objetiva sobre cuándo descansar, repasar o rendir el examen final.

---

## El problema

Un estudiante de medicina tiene apuntes dispersos, no sabe si estudió lo suficiente y practica siempre con los mismos cuestionarios. Las alternativas son PDFs estáticos o chats que desconocen el temario y no miden nada.

**A.T.L.A.S** une tres piezas: **contexto por materia + generación con IA + progreso medido**.

---

## Funcionalidades

| Bloque | Qué hace |
|---|---|
| **Profesor IA por materia** | Detecta la asignatura y usa su temario y los apuntes del estudiante como contexto. Cada respuesta proviene de un modelo real de Gemini (configurable también con OpenAI). |
| **Simulacros generados por IA** | Preguntas nuevas de aplicación clínica, 4 opciones, respuesta correcta distribuida, distractores plausibles y explicación. Examen final de 15 preguntas de toda la materia. |
| **Comunidad** | Cualquier visitante publica exámenes y opiniones; se comparten entre todos gracias a Netlify Blobs. |
| **Progreso real** | Cronómetro, sesiones, racha, promedio y preparación por materia. La IA redacta el veredicto: descansar, reforzar, examen final o seguir. |
| **Apuntes** | Cuaderno por materia con autoguardado, resumen y flashcards con IA, descarga `.txt` y copia `.json`. |
| **Plataforma** | 12 materias en 2 semestres, 5 temas, PWA instalable, cuenta por correo, exportación de datos y modo demostración para presentar. |

---

## Arquitectura

- **Frontend**: SPA en JavaScript vanilla, sin frameworks ni CDNs. Cinco temas, diseño responsive desde 320 px, accesibilidad AA.
- **Backend**: una **Netlify Function** (`api/handler.mjs`) sirve `/api/*`. La clave de IA vive como variable de entorno y **nunca llega al navegador**.
- **Datos compartidos**: **Netlify Blobs** para exámenes, opiniones y progreso por cuenta.
- **Seguridad**: CSP estricta, sin `innerHTML` con datos dinámicos, validación de esquemas en la función, lista blanca de modelos, sin endpoints arbitrarios.
- **Robustez**: si el modelo principal tiene alta demanda, reintenta con uno de respaldo; si un JSON sale malformado, reintenta con formato estricto. JSON corrupto o cuota llena en el navegador no rompen la app.
- **Sin inicio de sesión con Google**: retirado por decisión de producto. El correo es un identificador para sincronizar progreso.

---

## Verificación

**30 pruebas automatizadas, 0 fallos** sobre la edición Netlify: IA real en chat y simulacros, persistencia de comunidad y progreso, prueba de conexión, modo demostración, 5 temas, 4 anchos de pantalla sin desbordamiento y **cero errores de consola**. Seis generaciones consecutivas de simulacros produjeron preguntas del modelo en el 100 % de los casos.

---

## Guion de demo (3 minutos)

1. **Inicio (20 s)** — bienvenida, indicador «IA activa», accesos directos y cambio de tema desde la cabecera.
2. **Materia (40 s)** — entrar a *Anatomía 1*, preguntar al profesor «explícame el manguito rotador» y señalar el chip *Contexto: Anatomía 1*; escribir un apunte rápido.
3. **Preparar la demo (10 s)** — *Ajustes → Tus datos → Cargar datos de demostración*. Mencionar que están etiquetados como ejemplo y se borran con un clic.
4. **Progreso (45 s)** — gráfica de 7 días, racha, promedio y el veredicto redactado por la IA.
5. **Simulacros (40 s)** — generar uno con IA, responderlo y ver la revisión con explicación del modelo.
6. **Cierre (25 s)** — opiniones compartidas, descarga de apuntes y easter egg `benja estuvo aqui`.

---

## Siguientes pasos para producción corporativa

1. Autenticación real con sesiones y recuperación de cuenta.
2. Base de datos con moderación de contenido y control de versiones del temario.
3. Gobernanza de IA: cuotas por usuario, registro de costes y evaluación de calidad de preguntas.
4. Integración LMS (LTI / Moodle) y panel docente con analíticas anonimizadas.
5. Banco de preguntas curado por docentes e internacionalización.

---

**Preparado por:** ____________________  ·  **Fecha:** ____________________
**Contacto:** ____________________

*Material complementario:* `DESPLEGAR-NETLIFY.md`, `capturas/`, `tests/netlify_smoke.py`.
