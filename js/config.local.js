/* Configuración para Netlify: el backend /api lo sirve una Netlify Function. */
window.ATLAS_USER_CONFIG = Object.assign(window.ATLAS_USER_CONFIG || {}, { BACKEND: 'auto', API_BASE: '/api' });
