/* =========================================================================
   A.T.L.A.S — Configuración pública (NO incluye secretos)
   Las claves de API NUNCA van aquí: se pegan en Ajustes (se guardan solo en
   este navegador) o se definen como variables de entorno en server/server.js.
   ========================================================================= */
(function (global) {
  'use strict';

  var CONFIG = {
    VERSION: '2.0.0',
    BUILD: 'Edición Adaptativa',

    /* Backend de datos: 'auto' detecta el servidor incluido; también admite
       'node', 'firebase' (Realtime Database REST) o 'local'. */
    BACKEND: 'auto',
    API_BASE: '/api',                 // servidor Node incluido, mismo origen
    FIREBASE_DB_URL: '',              // ej. https://mi-proyecto-default-rtdb.firebaseio.com
    FIREBASE_ID_TOKEN: '',            // opcional si las reglas requieren auth

    /* Modelos vigentes (documentación oficial, noviembre 2026).
       Se pueden cambiar en Ajustes → Inteligencia Artificial. */
    PROVIDERS: {
      gemini: {
        label: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        defaultModel: 'gemini-3.5-flash-lite',
        fallbackModel: 'gemini-3.1-flash-lite',
        models: [
          { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite · recomendado' },
          { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite · muy rápido' },
          { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
          { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
          { id: 'gemini-4-argon', label: 'Gemini 4 Argon · máxima capacidad' }
        ]
      },
      openai: {
        label: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/responses',
        chatEndpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-6-luna',
        fallbackModel: 'gpt-6-luna',
        models: [
          { id: 'gpt-6-luna', label: 'GPT-6 Luna · eficiente (recomendado)' },
          { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol · calidad/coste' },
          { id: 'gpt-6-astra', label: 'GPT-6 Astra · máxima capacidad' }
        ]
      },
      custom: {
        label: 'Endpoint compatible OpenAI',
        endpoint: '',                 // ej. http://localhost:11434/v1/chat/completions (Ollama)
        defaultModel: '',
        fallbackModel: '',
        models: []
      }
    },

    LIMITS: {
      maxTitle: 120,
      maxText: 8000,
      maxQuestion: 400,
      maxOption: 220,
      maxQuestions: 20,
      minQuestions: 3,
      maxExams: 200,
      maxNotes: 500,
      maxOpinions: 200,
      aiTimeoutMs: 45000,
      notesContextChars: 3500
    },

    STORAGE_KEY: 'atlas.v2',
    LEGACY_KEYS: {
      notes: 'atlas_apuntes',
      user: 'atlas_usuario',
      opinions: 'atlas_opiniones',
      exams: 'atlas_examenes_comunidad',
      theme: 'theme'
    },

    /* Mensaje del easter egg. Se renderiza con escape seguro (nunca innerHTML). */
    EASTER_TRIGGER: 'benja estuvo aqui',
    EASTER_MESSAGE: '🚨 ¡K BRAZO A LA VISTA! 🚨  \n  \nMuchas gracias por usar **A.T.L.A.S** XD es mi primer proyecto grande y espero que les sea de utulidad y que no se te olvide nunca: **el creador absoluto y mente maestra de esta página web es el Benja 👻 :v**. Sigue con tus estudios k brazo '
  };

  /* Permite un archivo config.local.js opcional (no versionado) con overrides. */
  if (global.ATLAS_USER_CONFIG && typeof global.ATLAS_USER_CONFIG === 'object') {
    Object.keys(global.ATLAS_USER_CONFIG).forEach(function (k) { CONFIG[k] = global.ATLAS_USER_CONFIG[k]; });
  }

  global.ATLAS_CONFIG = CONFIG;
})(window);
