// ============================================================
// Agregar fuentes desde la web.
//
// Flujo:
//   1. Armamos un prompt (perfil + link o PDF + formato JSON) y abrimos claude.ai.
//   2. El usuario pega la respuesta de Claude (JSON) en la página.
//   3. Validamos el JSON y creamos fuentes/fuente-XXX.md en el repositorio usando
//      la API de GitHub, con un token que el usuario guarda en su navegador.
//   4. Una GitHub Action recalcula los embeddings y actualiza graph.json.
//
// ¿Por qué un token? La página es estática (GitHub Pages): no hay un servidor
// propio que pueda escribir en el repo. El token es una "llave" con permiso solo
// para el contenido de este repositorio.
//
// Seguridad:
// - Las visitas NO pueden guardar nada: GitHub solo deja crear tokens para repos
//   donde tienes permiso de escritura. El botón ＋ Fuente ni siquiera se les muestra.
// - Solo se aceptan tokens "fine-grained" (github_pat_...), que se limitan a un repo.
//   Los clásicos (ghp_...) dan acceso a TODOS tus repos: se rechazan.
// - El token vive solo en el localStorage de tu navegador; nunca va al código.
// ============================================================

const CLAVE_TOKEN = 'segundo-cerebro.github-token';
const API = 'https://api.github.com';

// --- ¿En qué repositorio estamos? --------------------------------
// En GitHub Pages la URL es usuario.github.io/repositorio/..., así que lo
// deducimos de ahí. En local (localhost) usamos el repo del proyecto.
function detectarRepo() {
  const { hostname, pathname } = window.location;
  if (hostname.endsWith('.github.io')) {
    const usuario = hostname.split('.')[0];
    const repo = pathname.split('/').filter(Boolean)[0];
    if (repo) return `${usuario}/${repo}`;
  }
  return 'arrobaaas/segundo-cerebro';
}
const REPO = detectarRepo();

// --- Token (en localStorage, solo en este navegador) ---------------
// localStorage puede fallar (modo privado, almacenamiento bloqueado): por eso try/catch.
function leerToken() {
  try { return localStorage.getItem(CLAVE_TOKEN) || ''; } catch { return ''; }
}
function guardarToken(token) {
  try { localStorage.setItem(CLAVE_TOKEN, token); return true; } catch { return false; }
}
function borrarToken() {
  try { localStorage.removeItem(CLAVE_TOKEN); } catch { /* nada que hacer */ }
}

// --- Llamadas a la API de GitHub ------------------------------------
async function github(ruta, opciones = {}) {
  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${leerToken()}`,
      ...(opciones.headers ?? {}),
    },
  });
  return respuesta;
}

// Explica en palabras simples los errores típicos de la API de GitHub
function explicarErrorGithub(estado) {
  if (estado === 401) return 'El token no es válido o expiró. Desconecta y crea uno nuevo.';
  if (estado === 403) return 'El token no tiene permiso de escritura (Contents: Read and write).';
  if (estado === 404) return `El token no tiene acceso al repositorio ${REPO}.`;
  if (estado === 409 || estado === 422) return 'Hubo un conflicto al guardar. Inténtalo de nuevo.';
  return `GitHub respondió con un error (${estado}). Inténtalo más tarde.`;
}

// Comprueba que el token puede leer el repositorio
async function verificarToken() {
  const r = await github(`/repos/${REPO}`);
  if (!r.ok) throw new Error(explicarErrorGithub(r.status));
}

// Siguiente id libre (fuente-001, fuente-002, ...) según los archivos del repo
async function siguienteId() {
  const r = await github(`/repos/${REPO}/contents/fuentes`);
  if (r.status === 404) return 'fuente-001'; // la carpeta todavía no existe
  if (!r.ok) throw new Error(explicarErrorGithub(r.status));
  const archivos = await r.json();
  let mayor = 0;
  for (const { name } of archivos) {
    const m = name.match(/^fuente-(\d+)\.md$/);
    if (m) mayor = Math.max(mayor, Number(m[1]));
  }
  return `fuente-${String(mayor + 1).padStart(3, '0')}`;
}

// La API pide el contenido en base64. btoa() solo acepta caracteres "latinos",
// así que primero convertimos el texto a bytes UTF-8 (tildes, ñ, emojis...).
function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

// Crea el archivo en el repo. Si justo se ocupó ese id (otro dispositivo), reintenta.
async function crearArchivoFuente(armarMarkdown, titulo) {
  for (let intento = 0; intento < 3; intento++) {
    const id = await siguienteId();
    const r = await github(`/repos/${REPO}/contents/fuentes/${id}.md`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `fuente: ${titulo}`,
        content: aBase64(armarMarkdown(id)),
      }),
    });
    if (r.ok) return id;
    if (r.status !== 422) throw new Error(explicarErrorGithub(r.status)); // 422 = ya existe
  }
  throw new Error('No se pudo encontrar un id libre. Inténtalo de nuevo.');
}

// --- Prompt para Claude ---------------------------------------------
const FORMATO = `Responde ÚNICAMENTE con un JSON dentro de un bloque \`\`\`json, sin texto antes ni
después, con exactamente esta forma:

\`\`\`json
{
  "titulo": "título corto en español que describa la fuente",
  "resumen": "3 a 5 oraciones: de qué trata y por qué me sirve en mi carrera",
  "aprendizajes": ["aprendizaje técnico concreto", "..."],
  "ideas_proyecto": [
    {"nombre": "nombre corto", "descripcion": "qué hace y qué problema resuelve", "mvp": "versión mínima construible en pocas semanas"}
  ],
  "tecnologias": ["tecnología o concepto clave", "..."]
}
\`\`\`

Incluye 3 a 5 aprendizajes y 2 o 3 ideas de proyecto.

IMPORTANTE: si no puedes acceder al contenido completo (por ejemplo, no puedes abrir el link
o leer la transcripción del video), NO inventes ni resumas a partir del título. Responde solo:
\`\`\`json
{"error": "explica brevemente qué no pudiste leer"}
\`\`\``;

function armarPrompt({ perfil, url, esPdf }) {
  const fuente = esPdf
    ? `Lee el PDF adjunto${url ? ` (también está en ${url})` : ''}.`
    : `Lee esta fuente (ábrela con tu herramienta de búsqueda/navegación web): ${url}`;
  return `Eres un mentor de carrera para un estudiante de Ingeniería en Informática.
Tu trabajo es leer una fuente y extraer lo que le sirve para su desarrollo profesional
y para construir proyectos reales.

Perfil del estudiante:
${perfil || 'Estudiante de Ingeniería en Informática.'}

Instrucciones:
- Escribe todo en español, claro y directo, aunque la fuente esté en otro idioma.
- El resumen va primero y debe capturar los temas técnicos principales.
- Las ideas de proyecto deben ser VIABLES para un estudiante: alcanzables con su nivel
  (estudiante de 4.º año), útiles para su portafolio y conectadas con la fuente. Evita ideas genéricas.
- Si la fuente no trata de informática, busca la conexión más razonable con su carrera.

${fuente}

${FORMATO}`;
}

// --- Leer y validar la respuesta de Claude ---------------------------
function leerRespuesta(texto) {
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) {
    throw new Error('No encontré un JSON en lo que pegaste. Copia el bloque completo de Claude.');
  }
  let datos;
  try {
    datos = JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    throw new Error('El JSON está incompleto o mal formado. ¿Se copió la respuesta completa?');
  }
  if (typeof datos.error === 'string') {
    throw new Error(`Claude no pudo leer la fuente: ${datos.error}`);
  }
  const esTexto = (v) => typeof v === 'string' && v.trim().length > 0;
  const esLista = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (!esTexto(datos.titulo) || !esTexto(datos.resumen)) {
    throw new Error('A la respuesta le falta el "titulo" o el "resumen".');
  }
  if (!esLista(datos.aprendizajes ?? []) || !esLista(datos.tecnologias ?? [])) {
    throw new Error('"aprendizajes" y "tecnologias" deben ser listas de textos.');
  }
  // Límites de tamaño: evitan que un texto pegado gigante (por error o a propósito)
  // termine como un archivo enorme en el repo que haga lenta la página.
  const corto = (v, max) => String(v ?? '').trim().slice(0, max);
  const ideas = (datos.ideas_proyecto ?? [])
    .filter((i) => i && esTexto(i.nombre))
    .slice(0, 5)
    .map((i) => ({ nombre: corto(i.nombre, 120), descripcion: corto(i.descripcion, 600), mvp: corto(i.mvp, 600) }));
  return {
    titulo: corto(datos.titulo, 150),
    resumen: corto(datos.resumen, 2000),
    aprendizajes: (datos.aprendizajes ?? []).slice(0, 8).map((a) => corto(a, 300)),
    ideas,
    tecnologias: (datos.tecnologias ?? []).slice(0, 15).map((x) => corto(x, 60)),
  };
}

// Mismo formato que armar_contenido() en scripts/agregar_fuente.py:
// el resumen va primero porque el modelo de embeddings lee solo el inicio.
function armarContenido(r) {
  const partes = [r.resumen, 'Aprendizajes clave:\n' + r.aprendizajes.map((a) => `• ${a}`).join('\n')];
  if (r.ideas.length) {
    partes.push('Ideas de proyecto que inspira:\n' +
      r.ideas.map((i) => `• ${i.nombre}: ${i.descripcion} MVP: ${i.mvp}`).join('\n'));
  }
  if (r.tecnologias.length) partes.push('Tecnologías: ' + r.tecnologias.join(', '));
  return partes.join('\n\n');
}

// Markdown con frontmatter YAML, igual que lo escribe scripts/cerebro.py.
// JSON.stringify produce texto entre comillas válido también en YAML, así un
// título con ":" o comillas no rompe el archivo.
function armarMarkdown(id, r, url, fecha) {
  return [
    '---',
    `id: ${id}`,
    `titulo: ${JSON.stringify(r.titulo)}`,
    'tipo: fuente',
    `fecha: '${fecha}'`,
    `fuente_url: ${url ? JSON.stringify(url) : 'null'}`,
    'padres: []',
    '---',
    '',
    armarContenido(r),
    '',
  ].join('\n');
}

// --- Interfaz ----------------------------------------------------------
// app.js nos pasa lo que necesitamos de él (así este módulo no depende de su interior).
export function iniciarAgregar({ obtenerMeta, obtenerNodos, agregarNodoLocal, alAbrir, copiarSincrono, avisar }) {
  const $ = (id) => document.getElementById(id);
  const hoja = $('agregar');
  const resultado = $('resultado-fuente');

  $('nombre-repo').textContent = REPO.split('/')[1];

  // El botón ＋ Fuente solo aparece en TUS dispositivos: los que ya tienen el token,
  // o si abres la página con #editar al final de la dirección (para conectarlo la
  // primera vez). Las visitas ven solo el grafo.
  const botonAgregar = $('btn-agregar');
  function actualizarModoEdicion() {
    botonAgregar.hidden = !(leerToken() || window.location.hash === '#editar');
  }
  actualizarModoEdicion();
  window.addEventListener('hashchange', actualizarModoEdicion);

  function mostrarResultado(texto, tipo) {
    resultado.textContent = texto;
    resultado.className = `ayuda-texto ${tipo ?? ''}`;
  }

  function actualizarEstadoGithub() {
    const conectado = Boolean(leerToken());
    $('paso-github').hidden = conectado;
    $('estado-github').hidden = !conectado;
    // Si no hay que conectar GitHub, los pasos se numeran desde 1
    document.querySelectorAll('#agregar .num-paso').forEach((el, i) => {
      el.textContent = String(i + (conectado ? 1 : 2));
    });
  }

  function tipoElegido() {
    return document.querySelector('input[name="tipo-fuente"]:checked').value;
  }

  function actualizarNotas() {
    const esPdf = tipoElegido() === 'pdf';
    const url = $('input-url').value;
    $('nota-pdf').hidden = !esPdf;
    $('nota-youtube').hidden = esPdf || !/youtu\.?be/i.test(url);
    $('input-url').placeholder = esPdf
      ? 'Link del PDF (opcional)'
      : 'https://… (artículo o video de YouTube)';
  }

  function abrir() {
    alAbrir(); // cierra el panel de detalle si estaba abierto
    actualizarEstadoGithub();
    actualizarNotas();
    hoja.classList.add('abierto');
    hoja.setAttribute('aria-hidden', 'false');
  }
  function cerrar() {
    hoja.classList.remove('abierto');
    hoja.setAttribute('aria-hidden', 'true');
  }

  $('btn-agregar').addEventListener('click', () => (hoja.classList.contains('abierto') ? cerrar() : abrir()));
  $('cerrar-agregar').addEventListener('click', cerrar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  document.querySelectorAll('input[name="tipo-fuente"]').forEach((r) => r.addEventListener('change', actualizarNotas));
  $('input-url').addEventListener('input', actualizarNotas);

  // Paso 1: conectar GitHub
  $('form-token').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('input-token').value.trim();
    if (!token) return;
    if (!token.startsWith('github_pat_')) {
      mostrarResultado('Usa un token "fine-grained" (empieza con github_pat_). Los tokens ' +
        'clásicos (ghp_…) dan acceso a todos tus repositorios: es demasiado riesgo.', 'error');
      return;
    }
    if (!guardarToken(token)) {
      mostrarResultado('Este navegador no permite guardar datos (¿modo privado?).', 'error');
      return;
    }
    try {
      await verificarToken();
      $('input-token').value = '';
      actualizarEstadoGithub();
      avisar('Conectado a GitHub ✓');
    } catch (err) {
      borrarToken();
      mostrarResultado(err.message, 'error');
    }
  });
  $('btn-desconectar').addEventListener('click', () => {
    borrarToken();
    actualizarEstadoGithub();
    actualizarModoEdicion();
  });

  // Paso 2: copiar el prompt y abrir Claude
  $('btn-prompt-fuente').addEventListener('click', () => {
    const esPdf = tipoElegido() === 'pdf';
    const url = $('input-url').value.trim();
    if ((!esPdf || url) && !/^https?:\/\/\S+$/i.test(url)) {
      mostrarResultado('Pega un link que empiece con http:// o https://', 'error');
      return;
    }
    if (url && obtenerNodos().some((n) => n.fuente_url === url)) {
      mostrarResultado('Ese link ya está en tu cerebro.', 'error');
      return;
    }
    mostrarResultado('');
    const prompt = armarPrompt({ perfil: obtenerMeta().perfil, url, esPdf });
    const copiado = copiarSincrono(prompt); // copiar ANTES de abrir la pestaña
    window.open('https://claude.ai/new', '_blank', 'noopener');
    avisar(copiado
      ? `Prompt copiado ✓ Pégalo en Claude${esPdf ? ' y adjunta el PDF' : ''}`
      : 'No se pudo copiar el prompt', 6000);
  });

  // Paso 3: guardar la respuesta en el repositorio
  $('btn-guardar-fuente').addEventListener('click', async () => {
    if (!leerToken()) {
      mostrarResultado('Primero conecta GitHub (paso 1).', 'error');
      return;
    }
    let r;
    try {
      r = leerRespuesta($('input-respuesta').value);
    } catch (err) {
      mostrarResultado(err.message, 'error');
      return;
    }

    const url = $('input-url').value.trim() || null;
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      mostrarResultado('El link debe empezar con http:// o https://', 'error');
      return;
    }
    const fecha = new Date().toLocaleDateString('sv-SE'); // formato AAAA-MM-DD, hora local
    const boton = $('btn-guardar-fuente');
    boton.disabled = true;
    mostrarResultado('Guardando en GitHub…');
    try {
      const id = await crearArchivoFuente((nuevoId) => armarMarkdown(nuevoId, r, url, fecha), r.titulo);
      // Lo mostramos al tiro (sin conexiones); la GitHub Action calcula los enlaces
      agregarNodoLocal({
        id, titulo: r.titulo, tipo: 'fuente', contenido: armarContenido(r),
        fecha, fuente_url: url, padres: [],
      });
      $('input-respuesta').value = '';
      $('input-url').value = '';
      resultado.className = 'ayuda-texto ok';
      resultado.replaceChildren(
        `✓ Guardada como ${id}. Las conexiones aparecerán en 2-4 minutos, cuando GitHub termine de `,
        Object.assign(document.createElement('a'), {
          href: `https://github.com/${REPO}/actions`, target: '_blank', rel: 'noopener noreferrer',
          textContent: 'reconstruir el grafo ↗',
        }),
        '. Recarga la página para verlas.',
      );
    } catch (err) {
      mostrarResultado(err.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  return { cerrar };
}
