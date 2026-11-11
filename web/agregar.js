// ============================================================
// Agregar fuentes desde la web (automático, sin copiar prompts).
//
// Flujo:
//   1. La página guarda pendientes/<id>.json en el repositorio (con el link, o
//      con los datos de un PDF que sube CIFRADO como pendientes/<id>.bin), usando
//      la API de GitHub con un token que el usuario guarda en su navegador.
//   2. Ese push dispara la GitHub Action "Construir grafo", que tiene la API key de
//      Claude como secreto de GitHub (nunca está en esta página): saca la
//      transcripción del video, el texto de la página o lee el PDF, lo resume con
//      Claude, crea fuentes/fuente-XXX.md y reconstruye graph.json.
//   3. Mientras tanto la página sigue la Action paso a paso (API de GitHub
//      Actions) y muestra un porcentaje de avance. Al terminar, la Action deja
//      pendientes/listos/<id>.json (o pendientes/fallidos/<id>.json con el error).
//   4. La página espera a que GitHub Pages publique el grafo nuevo y se recarga.
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
// - Los PDF se cifran aquí (RSA-OAEP + AES-256-GCM) con una clave PÚBLICA: el repo
//   es público, pero solo la Action (con la clave privada, secreto PDF_PRIVATE_KEY)
//   puede descifrarlos.
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

// Clave pública RSA-3072 (formato SPKI en base64) para cifrar los PDF.
// Es pública a propósito: sirve para cifrar, no para descifrar.
const CLAVE_PUBLICA_PDF = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA2wabCSZpkeUQHQFRLN+uTf14NMmgrU3g2N5vjSZPH+wT/RpWwuyoA8xyVzwyn1aocSrhq7oWSDN+3MrMWtgsaxLuX3O/ulPH43nCPTbvz1qZBe1LL/emWqGCVgfHY0V9mC2rKylRPPa1OA+hCNO5fq4kq6P2V+CjnfyAynH1oJ3KXFSoKaK9olO4u6ZU/y+ubHJr897B3ztJLpvY8Qv77ekn53QpAjj0TssJNZ4jkAKjRTJBcRU6Iu14O30r1TXqi2KHrdWOPFh3saLA2zf6WFUx/6G80hDBW9hQEcsge2KULzB1uloRcpltvCozXZKpim504Qo7imAJDp3chWvcsIxI6Bc2MMgTnsz7ya/OD7bffX6ozaXS5/E3PF85OEjlEuY7LlOvIsfdU01a/u8sqWGy+PKVFNlwnGQsM2I1ijC74+GF2RUHX4fjzBOL8w0Bfk2Xe8PoRBn0rP3KRXi9oOg1kE3DCsYldC+XoaRocVOymq1dEBoE3NBI8WPEFC7NAgMBAAE=';
const MAX_BYTES_PDF = 20 * 1024 * 1024; // mismo límite que scripts/agregar_fuente.py
const WORKFLOW = 'Construir grafo';

// --- Utilidades --------------------------------------------------------
// La API de GitHub pide el contenido en base64
function bytesABase64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}
const textoABase64 = (texto) => bytesABase64(new TextEncoder().encode(texto));
function base64ATexto(b64) {
  const binario = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Lecturas: con el token (5.000 consultas/hora). Si el token no tiene permiso
// para algo (p. ej. leer Actions), probamos sin token: el repo es público.
async function githubLectura(ruta) {
  const r = await github(ruta, { cache: 'no-store' });
  if (r.status !== 401 && r.status !== 403) return r;
  return fetch(`${API}${ruta}`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
}

// Lee un archivo JSON del repo; null si no existe
async function leerJsonRepo(ruta) {
  const r = await githubLectura(`/repos/${REPO}/contents/${ruta}`);
  if (!r.ok) return null;
  const archivo = await r.json();
  try {
    return { datos: JSON.parse(base64ATexto(archivo.content)), sha: archivo.sha };
  } catch {
    return { datos: {}, sha: archivo.sha };
  }
}

// Borra un archivo del repo (para no acumular resultados). Si falla, no importa.
function borrarArchivoRepo(ruta, sha) {
  github(`/repos/${REPO}/contents/${ruta}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: 'pendiente: limpiar', sha }),
  }).catch(() => {});
}

// Crea un archivo en el repo y devuelve el sha del commit
async function subirArchivo(ruta, contenidoBase64, mensaje) {
  const r = await github(`/repos/${REPO}/contents/${ruta}`, {
    method: 'PUT',
    body: JSON.stringify({ message: mensaje, content: contenidoBase64 }),
  });
  if (r.status === 413) throw new Error('El archivo es demasiado grande para GitHub.');
  if (!r.ok) throw new Error(explicarErrorGithub(r.status));
  return (await r.json()).commit.sha;
}

// --- Cifrado de PDF (Web Crypto, nativo del navegador) -------------------
// Formato: [384 bytes: clave AES cifrada con RSA] [12 bytes: IV] [PDF cifrado + etiqueta]
async function cifrarPdf(bytes) {
  const spki = Uint8Array.from(atob(CLAVE_PUBLICA_PDF), (c) => c.charCodeAt(0));
  const rsa = await crypto.subtle.importKey('spki', spki, { name: 'RSA-OAEP', hash: 'SHA-256' },
    false, ['encrypt']);
  const claveAes = crypto.getRandomValues(new Uint8Array(32)); // una clave nueva por PDF
  const aes = await crypto.subtle.importKey('raw', claveAes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, bytes));
  const claveCifrada = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, claveAes));
  claveAes.fill(0);
  const salida = new Uint8Array(claveCifrada.length + iv.length + cifrado.length);
  salida.set(claveCifrada, 0);
  salida.set(iv, claveCifrada.length);
  salida.set(cifrado, claveCifrada.length + iv.length);
  return salida;
}

// --- Seguimiento de la GitHub Action ------------------------------------
// Cada paso de la Action con un texto para mostrar y su duración aproximada en
// segundos (sirve de "peso" para el porcentaje y para avanzar suave dentro del paso).
const PASOS = [
  [/^Set up job/i, 'Preparando el servidor', 2],
  [/checkout/i, 'Descargando tu repositorio', 2],
  [/setup-python/i, 'Preparando Python', 5],
  [/cache/i, 'Cargando el modelo de IA', 6],
  [/Instalar/i, 'Instalando herramientas', 45],
  [/Procesar/i, null, 45], // el texto depende del tipo (video, página o PDF)
  [/Construir/i, 'Conectando con tus otras ideas', 10],
  [/Guardar/i, 'Guardando las estrellas nuevas', 4],
];

// Fracción (0 a 1) de la Action ya hecha y qué está haciendo ahora
function avanceDeJob(job, textoAnalisis) {
  let total = 0;
  let hecho = 0;
  let texto = 'Preparando el servidor';
  for (const paso of job?.steps ?? []) {
    const def = PASOS.find(([patron]) => patron.test(paso.name));
    const peso = def ? def[2] : 1;
    total += peso;
    if (paso.status === 'completed') {
      hecho += peso;
    } else if (paso.status === 'in_progress') {
      const seg = paso.started_at ? (Date.now() - Date.parse(paso.started_at)) / 1000 : 0;
      hecho += peso * Math.min(0.9, Math.max(0, seg) / peso); // nunca 100% hasta que termine
      if (def) texto = def[1] ?? textoAnalisis;
    }
  }
  return { fraccion: total ? hecho / total : 0, texto };
}

// Busca la ejecución de la Action que disparó nuestro commit
async function buscarEjecucion(shaCommit) {
  const r = await githubLectura(`/repos/${REPO}/actions/runs?head_sha=${shaCommit}&per_page=5`);
  if (!r.ok) return null;
  const { workflow_runs: runs = [] } = await r.json();
  return runs.find((run) => run.name === WORKFLOW) ?? null;
}

// La ejecución más reciente (si la nuestra se canceló porque llegó otro link,
// la siguiente procesa todos los pendientes, incluido el nuestro)
async function ultimaEjecucion() {
  const r = await githubLectura(`/repos/${REPO}/actions/runs?event=push&per_page=10`);
  if (!r.ok) return null;
  const { workflow_runs: runs = [] } = await r.json();
  return runs.find((run) => run.name === WORKFLOW) ?? null;
}

async function jobDe(run) {
  const r = await githubLectura(`/repos/${REPO}/actions/runs/${run.id}/jobs`);
  if (!r.ok) return null;
  return (await r.json()).jobs?.[0] ?? null;
}

// ¿Ya está publicado el grafo con estas estrellas? (GitHub Pages tarda ~1 min)
async function grafoPublicado(ids) {
  try {
    const r = await fetch(`graph.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const datos = await r.json();
    return datos.nodes.some((n) => ids.includes(n.id));
  } catch {
    return false;
  }
}

// --- Interfaz ----------------------------------------------------------
// app.js nos pasa lo que necesitamos de él (así este módulo no depende de su interior).
export function iniciarAgregar({ obtenerNodos, alAbrir, avisar }) {
  const $ = (id) => document.getElementById(id);
  const hoja = $('agregar');
  const resultado = $('resultado-fuente');
  let trabajando = false;

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

  function linkActions(textoAntes) {
    resultado.className = 'ayuda-texto';
    resultado.replaceChildren(
      textoAntes,
      Object.assign(document.createElement('a'), {
        href: `https://github.com/${REPO}/actions`, target: '_blank', rel: 'noopener noreferrer',
        textContent: 'GitHub Actions ↗',
      }),
      '.',
    );
  }

  // Barra de avance. Nunca retrocede (los cálculos por paso pueden "saltar").
  let porcentajeActual = 0;
  function progreso(porcentaje, texto, esError = false) {
    porcentajeActual = esError ? porcentajeActual : Math.max(porcentajeActual, Math.round(porcentaje));
    $('progreso').hidden = false;
    $('progreso').classList.toggle('error', esError);
    $('progreso-relleno').style.width = `${porcentajeActual}%`;
    $('progreso').querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(porcentajeActual));
    $('progreso-texto').textContent = texto;
    $('progreso-porcentaje').textContent = `${porcentajeActual}%`;
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
    $('nota-pdf').hidden = !esPdf;
    $('nota-link').hidden = esPdf;
    $('input-pdf').hidden = !esPdf;
    $('input-url').placeholder = esPdf
      ? 'Link del PDF (opcional)'
      : 'https://… (artículo, página web o video de YouTube)';
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

  // Sube lo necesario y devuelve { nombre, sha, textoAnalisis }
  async function enviar(esPdf, url) {
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const datos = { url: url || null, fecha: new Date().toISOString() };
    let textoAnalisis = /youtu\.?be/i.test(url)
      ? 'Claude está viendo la transcripción del video'
      : 'Claude está leyendo la página';

    if (esPdf) {
      const archivo = $('input-pdf').files[0];
      progreso(1, 'Cifrando el PDF en tu navegador…');
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const cifrado = await cifrarPdf(bytes);
      progreso(2, 'Subiendo el PDF cifrado…');
      // El .bin no dispara la Action: la dispara el .json que va después
      await subirArchivo(`pendientes/${nombre}.bin`, bytesABase64(cifrado), 'pendiente: PDF cifrado');
      Object.assign(datos, { tipo: 'pdf', nombre: archivo.name.slice(0, 120) });
      textoAnalisis = 'Claude está leyendo el PDF';
    }
    progreso(3, 'Enviando…');
    const sha = await subirArchivo(`pendientes/${nombre}.json`,
      textoABase64(JSON.stringify(datos, null, 2) + '\n'),
      esPdf ? `pendiente: PDF ${datos.nombre}` : `pendiente: ${url}`);
    return { nombre, sha, textoAnalisis };
  }

  // Sigue la Action hasta que el pendiente quede listo o falle.
  // Devuelve { ids } o { error }.
  async function seguir({ nombre, sha, textoAnalisis }) {
    const inicio = Date.now();
    let run = null;
    while (Date.now() - inicio < 25 * 60 * 1000) {
      await esperar(4000);
      run = run ?? await buscarEjecucion(sha);
      if (!run) {
        progreso(5, 'Esperando a que GitHub inicie el análisis…');
        // Si a los 90 s no aparece (p. ej. se juntó con otro envío), seguimos la última
        if (Date.now() - inicio > 90000) run = await ultimaEjecucion();
        continue;
      }
      const r = await githubLectura(`/repos/${REPO}/actions/runs/${run.id}`);
      if (r.ok) run = await r.json();

      if (run.status !== 'completed') {
        if (run.status === 'queued' || run.status === 'pending' || run.status === 'waiting') {
          progreso(6, 'En cola: esperando a que termine otro análisis…');
        } else {
          const { fraccion, texto } = avanceDeJob(await jobDe(run), textoAnalisis);
          progreso(8 + 82 * fraccion, `${texto}…`);
        }
        continue;
      }

      // La Action terminó: ¿qué pasó con nuestro pendiente?
      const listo = await leerJsonRepo(`pendientes/listos/${nombre}.json`);
      if (listo) {
        borrarArchivoRepo(`pendientes/listos/${nombre}.json`, listo.sha);
        return { ids: Array.isArray(listo.datos.ids) ? listo.datos.ids : [] };
      }
      const fallido = await leerJsonRepo(`pendientes/fallidos/${nombre}.json`);
      if (fallido) {
        borrarArchivoRepo(`pendientes/fallidos/${nombre}.json`, fallido.sha);
        return { error: String(fallido.datos.error || 'No se pudo procesar.') };
      }
      // Ni listo ni fallido: si se canceló (llegó otro envío), lo procesa la siguiente
      if (run.conclusion === 'cancelled' || await leerJsonRepo(`pendientes/${nombre}.json`)) {
        const siguiente = await ultimaEjecucion();
        if (siguiente && siguiente.id !== run.id) { run = siguiente; continue; }
      }
      if (run.conclusion !== 'success') {
        return { error: 'La Action de GitHub falló. Revisa el registro en GitHub Actions.' };
      }
    }
    return { error: 'Está tardando más de lo normal (25 min).' };
  }

  // Paso 2: agregar (link o PDF), todo automático
  $('btn-auto-fuente').addEventListener('click', async () => {
    if (trabajando) return;
    if (!leerToken()) {
      mostrarResultado('Primero conecta GitHub (paso 1).', 'error');
      return;
    }
    const esPdf = tipoElegido() === 'pdf';
    const url = $('input-url').value.trim();
    if ((url || !esPdf) && (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000)) {
      mostrarResultado('Pega un link que empiece con http:// o https://', 'error');
      return;
    }
    if (url && obtenerNodos().some((n) => n.fuente_url === url)) {
      mostrarResultado('Ese link ya está en tu cerebro.', 'error');
      return;
    }
    if (esPdf) {
      const archivo = $('input-pdf').files[0];
      if (!archivo) { mostrarResultado('Elige un archivo PDF.', 'error'); return; }
      if (archivo.size > MAX_BYTES_PDF) {
        mostrarResultado(`El PDF pesa ${(archivo.size / 1e6).toFixed(1)} MB (máximo 20 MB).`, 'error');
        return;
      }
    }

    trabajando = true;
    const boton = $('btn-auto-fuente');
    boton.disabled = true;
    porcentajeActual = 0;
    mostrarResultado('');
    try {
      const envio = await enviar(esPdf, url);
      $('input-url').value = '';
      $('input-pdf').value = '';
      const fin = await seguir(envio);
      if (fin.error) {
        progreso(porcentajeActual, 'No se pudo agregar', true);
        mostrarResultado(`✘ ${fin.error}`, 'error');
        return;
      }
      // Listo en el repo; falta que GitHub Pages publique el grafo nuevo
      const inicio = Date.now();
      while (Date.now() - inicio < 5 * 60 * 1000) {
        const seg = (Date.now() - inicio) / 1000;
        progreso(92 + 7 * Math.min(1, seg / 90), 'Publicando las estrellas nuevas…');
        if (fin.ids.length === 0 || await grafoPublicado(fin.ids)) break;
        await esperar(5000);
      }
      progreso(100, '¡Listo! Mostrando tus estrellas nuevas');
      avisar('Fuente agregada ✓', 4000);
      await esperar(1200);
      window.location.reload();
    } catch (err) {
      progreso(porcentajeActual, 'No se pudo agregar', true);
      if (err instanceof TypeError) linkActions('Se perdió la conexión. Revisa el estado en ');
      else mostrarResultado(err.message, 'error');
    } finally {
      trabajando = false;
      boton.disabled = false;
    }
  });

  return { cerrar };
}
