/* =========================================================================
   Catálogo académico y contenido base. Fuente única de verdad para materias,
   semestres, temas y datos curiosos (antes repetido en 7 páginas clonadas).
   ========================================================================= */
(function (global) {
  'use strict';

  var SUBJECTS = [
    { id: 'anatomia1', name: 'Anatomía 1', semester: 1, icon: 'i-heart', hue: 342,
      desc: 'Estudio descriptivo y topográfico de las estructuras macroscópicas: sistemas óseo, muscular y cardiovascular.',
      topics: ['Osteología y articulaciones', 'Miología del miembro superior', 'Sistema cardiovascular', 'Sistema nervioso periférico', 'Topografía torácica'] },
    { id: 'histologia1', name: 'Histología 1', semester: 1, icon: 'i-book', hue: 196,
      desc: 'Análisis microscópico de los cuatro tejidos fundamentales y sus técnicas de preparación.',
      topics: ['Tejido epitelial', 'Tejido conectivo', 'Tejido muscular', 'Tejido nervioso', 'Tinciones H-E y preparación tisular'] },
    { id: 'embriologia', name: 'Embriología', semester: 1, icon: 'i-spark', hue: 280,
      desc: 'Desarrollo prenatal desde la fecundación hasta la organogénesis y sus alteraciones.',
      topics: ['Fecundación e implantación', 'Gastrulación y capas germinativas', 'Neurulación', 'Desarrollo de arcos faríngeos', 'Teratogenia y malformaciones'] },
    { id: 'genetica', name: 'Genética', semester: 1, icon: 'i-shield', hue: 152,
      desc: 'Herencia biológica, estructura del ADN, expresión génica y patologías hereditarias.',
      topics: ['Leyes de Mendel', 'Estructura y replicación del ADN', 'Expresión génica', 'Mutaciones y cromosomopatías', 'Árboles genealógicos clínicos'] },
    { id: 'bioestadistica', name: 'Bioestadística', semester: 1, icon: 'i-chart', hue: 32,
      desc: 'Métodos estadísticos aplicados a ciencias de la salud, probabilidad y variables clínicas.',
      topics: ['Tipos de variables y escalas', 'Medidas de tendencia central', 'Dispersión y distribución normal', 'Prueba de hipótesis y valor p', 'Sensibilidad y especificidad'] },
    { id: 'terminologia', name: 'Terminología Médica', semester: 1, icon: 'i-file', hue: 218,
      desc: 'Raíces, prefijos y sufijos para interpretar con precisión el lenguaje clínico.',
      topics: ['Prefijos y sufijos griegos', 'Raíces latinas de sistemas y órganos', 'Terminología de procedimientos', 'Abreviaturas clínicas', 'Construcción de términos compuestos'] },

    { id: 'anatomia2', name: 'Anatomía 2', semester: 2, icon: 'i-brain', hue: 262,
      desc: 'Neuroanatomía, vísceras y topografía de cavidades abdominal y pélvica.',
      topics: ['Pares craneales', 'Tronco encefálico y cerebelo', 'Irrigación del sistema nervioso central', 'Topografía abdominal', 'Plexos y sistema nervioso periférico'] },
    { id: 'histologia2', name: 'Histología 2', semester: 2, icon: 'i-book', hue: 176,
      desc: 'Organografía microscópica de aparatos y sistemas: endocrino, digestivo, renal y reproductor.',
      topics: ['Glándulas endocrinas', 'Tubo digestivo y glándulas anexas', 'Nefrona y aparato urinario', 'Sistema reproductor', 'Alvéolos y barrera respiratoria'] },
    { id: 'demografia', name: 'Demografía', semester: 2, icon: 'i-users', hue: 202,
      desc: 'Dinámica poblacional, tasas e indicadores de salud pública.',
      topics: ['Natalidad, mortalidad y fecundidad', 'Migración y estructura por edades', 'Pirámides poblacionales', 'Indicadores de salud pública', 'Transición demográfica'] },
    { id: 'tecnicas', name: 'Técnicas de Investigación', semester: 2, icon: 'i-chart', hue: 20,
      desc: 'Método científico, diseño de protocolos biomédicos y redacción académica.',
      topics: ['Formulación de hipótesis y variables', 'Diseños observacionales y experimentales', 'Muestreo y tamaño de muestra', 'Sesgos y confusión', 'Estructura IMRaD y citas'] },
    { id: 'aymara', name: 'Aymara', semester: 2, icon: 'i-users', hue: 140,
      desc: 'Comunicación intercultural aplicada a la atención médico-paciente en contextos andinos.',
      topics: ['Saludos y presentación clínica', 'Vocabulario del cuerpo y síntomas', 'Interrogatorio médico básico', 'Números y tiempo', 'Expresiones de respeto y consentimiento'] },
    { id: 'ingles', name: 'Inglés Médico', semester: 2, icon: 'i-file', hue: 222,
      desc: 'Comprensión lectora y terminología para literatura científica internacional.',
      topics: ['Terminología clínica en inglés', 'Estructura de artículos científicos', 'Abstracts y palabras clave', 'Verbos de reporte y hedging', 'Lectura crítica de evidencia'] }
  ];

  var FACTS = [
    'El hueso más pequeño del cuerpo humano es el estribo, en el oído medio: mide apenas 3 milímetros.',
    'El hígado puede regenerar gran parte de su masa a partir de aproximadamente un cuarto de tejido sano.',
    'El corazón bombea unos 7.200 litros de sangre al día a través de más de 96.000 km de vasos.',
    'Las córneas no reciben sangre: obtienen oxígeno directamente del aire y del humor acuoso.',
    'Los impulsos nerviosos pueden viajar a velocidades cercanas a los 400 km/h.',
    'El estómago mantiene un pH entre 1,5 y 3,5 y renueva su mucosa cada pocos días.',
    'El cuerpo humano produce alrededor de 2 millones de glóbulos rojos por segundo.',
    'Los pulmones tienen una superficie de intercambio similar a la de media cancha de tenis.',
    'El ADN de una sola célula estirado mide cerca de 2 metros, y caben unos 2 metros en cada núcleo gracias al empaquetamiento.',
    'La microbiota intestinal contiene más células bacterianas que células propias tiene el cuerpo.',
    'El músculo masetero es, por superficie, uno de los más potentes del cuerpo.',
    'El timo alcanza su mayor tamaño en la infancia y luego involuciona progresivamente.'
  ];

  var byId = {};
  SUBJECTS.forEach(function (s) { byId[s.id] = s; });

  var API = {
    subjects: SUBJECTS,
    facts: FACTS,
    byId: function (id) { return byId[id] || null; },
    bySemester: function (n) { return SUBJECTS.filter(function (s) { return s.semester === Number(n); }); },
    label: function (id) { return byId[id] ? byId[id].name : (id === 'general' ? 'General' : String(id || 'General')); },
    gradient: function (s) {
      var h = s && s.hue != null ? s.hue : 240;
      return 'linear-gradient(135deg, hsl(' + h + ' 68% 52%), hsl(' + ((h + 48) % 360) + ' 72% 42%))';
    },
    randomFact: function (exclude) {
      var pool = FACTS.filter(function (f) { return f !== exclude; });
      return pool[Math.floor(Math.random() * pool.length)];
    },
    /* Temas de referencia para el motor local y para el contexto del LLM. */
    allTopics: function (subjectId) {
      var s = byId[subjectId];
      return s ? s.topics.slice() : SUBJECTS.reduce(function (a, x) { return a.concat(x.topics.map(function (t) { return x.name + ': ' + t; })); }, []);
    }
  };

  global.ATLAS = global.ATLAS || {};
  global.ATLAS.data = API;
})(window);
