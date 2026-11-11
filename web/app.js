// ============================================================
// Segundo Cerebro — visor 3D
// Carga graph.json, dibuja el grafo con 3d-force-graph y maneja
// la selección de nodos (panel de detalle + resaltado de conexiones).
// ============================================================

// --- Librerías (copias locales en web/vendor/) ----------------
// Por seguridad, las librerías están DENTRO del repositorio (no en un CDN):
// así la página solo ejecuta código versionado aquí. Se descargan con
// scripts/descargar_librerias.py. Three.js es la misma versión exacta que usa
// 3d-force-graph por dentro (0.186.1), así hay una sola copia en memoria.
import ForceGraph3D from './vendor/3d-force-graph.js';
import * as THREE from './vendor/three.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
// Nuestro módulo para agregar fuentes desde la web (ver agregar.js)
import { iniciarAgregar } from './agregar.js';

// --- Anti-clickjacking -------------------------------------------
// GitHub Pages no deja enviar el encabezado X-Frame-Options, y la CSP en <meta>
// no admite frame-ancestors. Así que si otra web mete esta página en un iframe
// (para engañarte y que hagas clic en "Guardar" sin verla), no mostramos nada.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  throw new Error('Segundo Cerebro no se puede mostrar dentro de otra página.');
}

// --- Configuración visual ------------------------------------

// Un color por "clase" de nodo. Las fuentes se separan según de dónde vienen:
// video de YouTube, página web o PDF.
const COLORES = {
  idea: '#a855f7',      // morado
  video: '#ef4444',     // rojo
  web: '#f97316',       // naranjo
  pdf: '#facc15',       // amarillo
  fusionada: '#22c55e', // verde
};
const NOMBRES_CLASE = {
  idea: 'Idea', video: 'Video', web: 'Página web', pdf: 'PDF', fusionada: 'Fusionada',
};
const COLOR_DESCONOCIDO = '#888888';

// Color de cada tema (galaxia): para su nebulosa, su nombre y la lista lateral
const COLORES_TEMA = {
  web: '#38bdf8', ia: '#a78bfa', datos: '#34d399', ciberseguridad: '#f43f5e',
  juegos: '#fbbf24', movil: '#2dd4bf', nube: '#60a5fa', automatizacion: '#fb923c',
  carrera: '#f472b6', otros: '#94a3b8',
};

const OPACIDAD_ATENUADA = 0.12; // qué tan "apagado" queda lo que no está conectado
const DISTANCIA_CAMARA = 60;    // distancia al enfocar un nodo sin conexiones

// --- Estado ---------------------------------------------------

const nodosPorId = new Map();     // id -> objeto nodo
const vecinosPorId = new Map();   // id -> Set de ids vecinos
const enlacesPorId = new Map();   // id -> Set de objetos enlace que lo tocan

let seleccionado = null;          // nodo actualmente seleccionado (o null)
let modoGalaxias = false;         // ¿ideas separadas por tema? (botón 🌌)
const nodosResaltados = new Set();
const enlacesResaltados = new Set();

// --- Utilidades -----------------------------------------------

// Convierte "#rrggbb" + alfa en "rgba(...)". La librería usa el alfa
// del color como opacidad, así atenuamos nodos sin tocar el resto.
function conAlfa(hex, alfa) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

// Después de que la librería procesa los datos, source/target de cada
// enlace pasan de ser ids (texto) a ser el objeto nodo. Esto sirve en ambos casos.
const idDe = (extremo) => (typeof extremo === 'object' ? extremo.id : extremo);

// Escapa HTML. El tooltip de la librería usa innerHTML, y más adelante los
// títulos vendrán de páginas web: no queremos que un título ejecute código.
function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Clase visible de un nodo: las fuentes se dividen por origen (video, web, pdf)
const claseDe = (nodo) => (nodo.tipo === 'fuente' ? (nodo.origen || 'web') : nodo.tipo);
const colorDe = (nodo) => COLORES[claseDe(nodo)] ?? COLOR_DESCONOCIDO;
const categoriaDe = (nodo) => nodo.categoria || 'otros';
const colorTema = (cat) => COLORES_TEMA[cat] ?? COLORES_TEMA.otros;

// --- Índices de vecinos ---------------------------------------
// Se arman una sola vez al cargar. Así, al hacer clic, saber quiénes son
// los vecinos de un nodo es instantáneo en vez de recorrer todos los enlaces.

function construirIndices(datos) {
  for (const nodo of datos.nodes) {
    nodosPorId.set(nodo.id, nodo);
    vecinosPorId.set(nodo.id, new Set());
    enlacesPorId.set(nodo.id, new Set());
  }

  // Descartamos enlaces que apuntan a nodos inexistentes: la librería
  // fallaría con ellos, y es mejor avisar en la consola que romper todo.
  datos.links = datos.links.filter((enlace) => {
    const a = idDe(enlace.source);
    const b = idDe(enlace.target);
    if (!nodosPorId.has(a) || !nodosPorId.has(b)) {
      console.warn('Enlace ignorado (nodo inexistente):', a, '→', b);
      return false;
    }
    vecinosPorId.get(a).add(b);
    vecinosPorId.get(b).add(a);
    enlacesPorId.get(a).add(enlace);
    enlacesPorId.get(b).add(enlace);
    return true;
  });
}

// --- Apariencia de nodos y enlaces ----------------------------
// La librería llama a estas funciones por cada nodo/enlace.

// --- Estrellas tipo rosa de los vientos -----------------------
//
// La geometría se crea UNA vez y la comparten todas las estrellas (solo
// cambia el material/color). Es mucho más liviano que crear una por nodo.
//
// Forma: un contorno de 16 vértices alternando "punta" y "valle":
//   - 4 puntas largas (N, E, S, O) y 4 cortas (NE, SE, SO, NO).
// Luego unimos cada borde del contorno con un vértice al frente (z>0) y otro
// atrás (z<0). Cada punta queda con una arista central y dos caras inclinadas:
// la luz ilumina una cara y deja la otra más oscura, como en las rosas de los
// vientos dibujadas a mano.
function crearGeometriaRosa() {
  const RADIO_LARGA = 1.0;
  const RADIO_CORTA = 0.6;
  const RADIO_VALLE = 0.24;
  const ALTURA = 0.32; // qué tan "abultada" es la estrella

  const contorno = [];
  for (let i = 0; i < 16; i++) {
    const angulo = Math.PI / 2 + (i * Math.PI) / 8; // empieza apuntando arriba (norte)
    let r;
    if (i % 4 === 0) r = RADIO_LARGA;       // N, O, S, E
    else if (i % 2 === 0) r = RADIO_CORTA;  // diagonales
    else r = RADIO_VALLE;                   // valles entre puntas
    contorno.push([Math.cos(angulo) * r, Math.sin(angulo) * r, 0]);
  }

  const frente = [0, 0, ALTURA];
  const atras = [0, 0, -ALTURA];
  const posiciones = [];
  for (let i = 0; i < 16; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % 16];
    posiciones.push(...frente, ...a, ...b); // cara de adelante
    posiciones.push(...atras, ...b, ...a);  // cara de atrás (orden inverso)
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  // Sin índices, cada triángulo tiene su propia normal: caras "planas" facetadas
  geo.computeVertexNormals();
  return geo;
}

const GEOMETRIA_ROSA = crearGeometriaRosa();
// Esfera invisible para recibir clics: la estrella es delgada y en el celular
// sería difícil de tocar; esta "zona de toque" es un poco más grande.
const GEOMETRIA_TOQUE = new THREE.SphereGeometry(1.15, 8, 8);
const MATERIAL_TOQUE = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0, depthWrite: false,
});

const estrellas = new Map(); // id -> { grupo, material, fase }

// Tamaño: crece un poco con las conexiones, con tope para que no sean enormes
function tamanoEstrella(nodo) {
  const grado = vecinosPorId.get(nodo.id)?.size ?? 0;
  return 4 + Math.min(grado, 6) * 0.4; // entre 4 y ~6.4 unidades
}

// La librería llama esto por cada nodo para pedir su objeto 3D
function crearEstrella(nodo) {
  if (estrellas.has(nodo.id)) return estrellas.get(nodo.id).grupo;

  const color = new THREE.Color(colorDe(nodo));
  // MeshStandardMaterial reacciona a la luz (efecto 3D) y con "emissive"
  // además emite luz propia: así brilla incluso en la cara oscura.
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    metalness: 0.35,
    roughness: 0.3,
    flatShading: true,
    transparent: true,
  });

  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(GEOMETRIA_ROSA, material));
  grupo.add(new THREE.Mesh(GEOMETRIA_TOQUE, MATERIAL_TOQUE));
  grupo.scale.setScalar(tamanoEstrella(nodo));

  // fase aleatoria: así cada estrella titila a su propio ritmo
  estrellas.set(nodo.id, { grupo, material, fase: Math.random() * Math.PI * 2 });
  return grupo;
}

// Aplica el resaltado a las estrellas (brillantes o atenuadas)
function actualizarEstrellas() {
  for (const [id, { material }] of estrellas) {
    const activa = !seleccionado || nodosResaltados.has(nodosPorId.get(id));
    material.opacity = activa ? 1 : OPACIDAD_ATENUADA;
    material.userData.atenuada = !activa;
  }
}

// Animación en cada cuadro: las estrellas miran siempre a la cámara
// (si no, vistas de lado serían una línea) y titilan suavemente.
function animarEstrellas(tiempo) {
  const camara = Grafo.camera();
  const t = tiempo / 1000;
  for (const { grupo, material, fase } of estrellas.values()) {
    grupo.quaternion.copy(camara.quaternion);
    const base = material.userData.atenuada ? 0.1 : 0.55;
    material.emissiveIntensity = base + 0.2 * Math.sin(t * 2.2 + fase);
  }
  requestAnimationFrame(animarEstrellas);
}

function colorEnlace(enlace) {
  // Los enlaces "padre" (fusionada -> origen) van en verde suave
  const base = enlace.tipo === 'padre' ? '#4ade80' : '#c4c4d4';
  if (!seleccionado) {
    // Con galaxias, los enlaces entre galaxias distintas casi no se ven
    const entreGalaxias = modoGalaxias &&
      categoriaDe(nodosPorId.get(idDe(enlace.source))) !== categoriaDe(nodosPorId.get(idDe(enlace.target)));
    return conAlfa(base, entreGalaxias ? 0.05 : 0.18);
  }
  return enlacesResaltados.has(enlace) ? conAlfa(base, 0.6) : conAlfa(base, 0.03);
}

// Grosor según la similitud: entre más parecidas las ideas, más grueso
function anchoEnlace(enlace) {
  const s = enlace.similitud ?? 0.6;
  const ancho = 0.15 + (s - 0.5) * 1.2; // ~0.27 a ~0.75
  return enlacesResaltados.has(enlace) ? ancho * 1.8 : ancho;
}

// --- Crear el grafo -------------------------------------------

const contenedor = document.getElementById('grafo');

// controlType 'orbit': la cámara gira alrededor del centro con un "arriba"
// fijo; es más difícil desorientarse que con 'trackball'.
const Grafo = new ForceGraph3D(contenedor, { controlType: 'orbit' })
  .backgroundColor('#000000')
  .showNavInfo(false) // ocultamos la ayuda en inglés de la librería; usamos la nuestra
  .nodeId('id')
  .nodeLabel((n) => `<div class="tooltip">${escaparHtml(n.titulo)}</div>`)
  .nodeThreeObject(crearEstrella) // en vez de esferas, nuestras estrellas
  .linkColor(colorEnlace)
  .linkWidth(anchoEnlace)
  .linkOpacity(1) // la opacidad real la controla el alfa de colorEnlace
  // warmupTicks: corre 150 pasos de la física ANTES de dibujar, así el grafo
  // aparece ya ordenado en vez de "explotar" desde el centro.
  .warmupTicks(150)
  .cooldownTime(3000) // después, 3 s más de animación suave y se detiene
  .onNodeClick(seleccionarNodo)
  .onBackgroundClick(limpiarSeleccion)
  .onNodeHover((n) => { contenedor.style.cursor = n ? 'pointer' : ''; });

// Fuerza de los enlaces: los pares más similares quedan más cerca.
// Así los grupos de ideas relacionadas se forman solos.
Grafo.d3Force('link')
  .distance((e) => 25 + (1 - (e.similitud ?? 0.6)) * 120)
  .strength(fuerzaEnlace);

// Igual que la fuerza por defecto de d3 (1 / enlaces del nodo con menos enlaces),
// pero en modo galaxias los enlaces ENTRE galaxias casi no tiran: así cada
// galaxia se separa aunque tenga ideas conectadas con otra.
function fuerzaEnlace(e) {
  const a = idDe(e.source);
  const b = idDe(e.target);
  const base = 1 / Math.max(1, Math.min(enlacesPorId.get(a)?.size ?? 1, enlacesPorId.get(b)?.size ?? 1));
  if (modoGalaxias && categoriaDe(nodosPorId.get(a)) !== categoriaDe(nodosPorId.get(b))) return base * 0.03;
  return base;
}

// Bloom: efecto de post-procesado que hace que lo brillante "irradie" un halo
// de luz alrededor. Parámetros: intensidad, radio del halo y umbral (solo
// brilla lo que supera ese nivel de luz, así los enlaces grises casi no brillan).
const bloom = new UnrealBloomPass(
  new THREE.Vector2(Math.max(window.innerWidth, 1), Math.max(window.innerHeight, 1)),
  1.3,  // intensidad
  0.35, // radio
  0.35, // umbral
);
Grafo.postProcessingComposer().addPass(bloom);

requestAnimationFrame(animarEstrellas);

// Para curiosear desde la consola del navegador (F12): cerebro.grafo, etc.
window.cerebro = { grafo: Grafo, seleccionarNodo, nodosPorId };

// --- Encuadre inicial ----------------------------------------
// La librería procesa los datos de forma asíncrona: justo después de
// graphData() los nodos todavía no tienen posición. Si encuadramos antes de
// tiempo, la "caja" del grafo mide ~0 y la cámara queda pegada al centro.
// onEngineTick se dispara en cada paso de la simulación (¡incluso antes de
// cargar los datos!). En cada paso revisamos si el grafo ya tiene un tamaño
// real; la primera vez que sí, encuadramos. No depende de tiempos ni timers.
let yaEncuadrado = false;

function encuadrar() {
  yaEncuadrado = true;
  Grafo.zoomToFit(800, 40);
}

let encuadrarAlParar = false; // al juntar/separar galaxias, encuadrar cuando se acomoden

Grafo.onEngineTick(() => {
  if (modoGalaxias) moverDecoracionGalaxias();
  if (yaEncuadrado) return;
  const caja = Grafo.getGraphBbox();
  if (!caja) return; // todavía no hay nodos
  const tamano = Math.max(caja.x[1] - caja.x[0], caja.y[1] - caja.y[0], caja.z[1] - caja.z[0]);
  if (tamano > 10) encuadrar();
});
// Respaldo: si el grafo es diminuto (ej. un solo nodo), encuadramos al final
Grafo.onEngineStop(() => {
  if (!yaEncuadrado) encuadrar();
  else if (encuadrarAlParar && !seleccionado) Grafo.zoomToFit(900, 60);
  encuadrarAlParar = false;
});

// Ajustar el tamaño al girar el celular o cambiar el tamaño de la ventana
window.addEventListener('resize', () => {
  Grafo.width(window.innerWidth).height(window.innerHeight);
  ajustarVistaPanel(panel.classList.contains('abierto'));
});

// --- Selección ------------------------------------------------

// Vuelve a pedir colores/anchos a la librería después de cambiar el resaltado
function refrescarEstilos() {
  actualizarEstrellas();
  // Con una idea seleccionada, las galaxias se apagan para no distraer
  for (const { nebulosa, etiqueta } of decoracionGalaxia.values()) {
    nebulosa.material.opacity = seleccionado ? 0.3 : 1;
    etiqueta.material.opacity = seleccionado ? 0.35 : 0.9;
  }
  Grafo.linkColor(Grafo.linkColor())
    .linkWidth(Grafo.linkWidth());
}

function seleccionarNodo(nodo) {
  seleccionado = nodo;

  nodosResaltados.clear();
  enlacesResaltados.clear();
  nodosResaltados.add(nodo);
  for (const id of vecinosPorId.get(nodo.id)) nodosResaltados.add(nodosPorId.get(id));
  for (const enlace of enlacesPorId.get(nodo.id)) enlacesResaltados.add(enlace);

  refrescarEstilos();
  marcarEnLista();
  enfocarCamara(nodo);
  hojaAgregar?.cerrar(); // si estaba abierta la hoja "Agregar fuente", la cerramos
  mostrarPanel(nodo);
}

function limpiarSeleccion() {
  if (!seleccionado) return;
  seleccionado = null;
  nodosResaltados.clear();
  enlacesResaltados.clear();
  refrescarEstilos();
  marcarEnLista();
  ocultarPanel();
}

// Mueve la cámara para encuadrar el nodo JUNTO con sus vecinos, así ves
// de inmediato con qué se conecta. zoomToFit acepta un filtro de nodos.
function enfocarCamara(nodo) {
  if (vecinosPorId.get(nodo.id).size > 0) {
    // En celular el panel tapa la mitad de abajo: dejamos más margen para que
    // el encuadre quepa en la mitad de arriba (ver ajustarVistaPanel)
    const margen = esMovil() ? Math.round(window.innerHeight * 0.25) + 20 : 70;
    Grafo.zoomToFit(1000, margen, (n) => nodosResaltados.has(n));
    return;
  }
  // Nodo sin conexiones: lo miramos de cerca, sobre la línea centro -> nodo
  const r = Math.hypot(nodo.x, nodo.y, nodo.z);
  const destino = r < 1
    ? { x: 0, y: 0, z: DISTANCIA_CAMARA } // nodo justo en el centro: evitamos dividir por ~0
    : {
        x: nodo.x * (1 + DISTANCIA_CAMARA / r),
        y: nodo.y * (1 + DISTANCIA_CAMARA / r),
        z: nodo.z * (1 + DISTANCIA_CAMARA / r),
      };
  Grafo.cameraPosition(destino, nodo, 1000); // 1000 ms de animación
}

// --- Panel de detalle -----------------------------------------

const panel = document.getElementById('panel');
const el = (id) => document.getElementById(id);

function mostrarPanel(nodo) {
  // Tipo (chip de color)
  const chip = el('panel-tipo');
  chip.textContent = NOMBRES_CLASE[claseDe(nodo)] ?? nodo.tipo;
  chip.style.background = colorDe(nodo);

  el('panel-titulo').textContent = nodo.titulo;
  el('panel-meta').textContent = [
    nodo.fecha ? `📅 ${nodo.fecha}` : '',
    `🗂 ${nombreTema(categoriaDe(nodo))}`,
  ].filter(Boolean).join(' · ');

  // Link a la fuente: solo http/https, para que nadie cuele un "javascript:..."
  const url = el('panel-url');
  if (nodo.fuente_url && /^https?:\/\//i.test(nodo.fuente_url)) {
    url.href = nodo.fuente_url;
    url.textContent = `Abrir fuente ↗ ${new URL(nodo.fuente_url).hostname}`;
    url.hidden = false;
  } else {
    url.hidden = true;
  }

  // Contenido: un <p> por párrafo. Usamos textContent (no innerHTML)
  // para que el texto se muestre tal cual y nunca se ejecute como HTML.
  const contenido = el('panel-contenido');
  contenido.replaceChildren();
  for (const parrafo of String(nodo.contenido ?? '').split(/\n\s*\n/)) {
    if (!parrafo.trim()) continue;
    const p = document.createElement('p');
    p.textContent = parrafo.trim();
    contenido.appendChild(p);
  }

  // Padres (solo las ideas fusionadas tienen)
  const padres = (nodo.padres ?? []).filter((id) => nodosPorId.has(id));
  el('panel-padres-seccion').hidden = padres.length === 0;
  llenarLista(el('panel-padres'), padres.map((id) => ({ nodo: nodosPorId.get(id) })));

  // Conexiones, ordenadas de más a menos similar
  const conexiones = [...enlacesPorId.get(nodo.id)].map((e) => {
    const otroId = idDe(e.source) === nodo.id ? idDe(e.target) : idDe(e.source);
    return { nodo: nodosPorId.get(otroId), similitud: e.similitud };
  });
  conexiones.sort((a, b) => (b.similitud ?? 0) - (a.similitud ?? 0));
  el('panel-num-conexiones').textContent = `(${conexiones.length})`;
  llenarLista(el('panel-conexiones'), conexiones);

  mostrarPlan(nodo);
  el('input-pregunta').value = '';

  ajustarVistaPanel(true);
  panel.classList.add('abierto');
  panel.setAttribute('aria-hidden', 'false');
  panel.scrollTop = 0;
}

// Llena una lista con botones; al tocarlos se salta a ese nodo
function llenarLista(ul, items) {
  ul.replaceChildren();
  for (const { nodo, similitud } of items) {
    const boton = document.createElement('button');
    boton.type = 'button';

    const punto = iconoEstrella(colorDe(nodo));

    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = nodo.titulo;

    boton.append(punto, nombre);

    if (similitud != null) {
      const sim = document.createElement('span');
      sim.className = 'similitud';
      sim.textContent = `${Math.round(similitud * 100)}%`;
      boton.appendChild(sim);
    }

    boton.addEventListener('click', () => seleccionarNodo(nodo));
    const li = document.createElement('li');
    li.appendChild(boton);
    ul.appendChild(li);
  }
}

function ocultarPanel() {
  panel.classList.remove('abierto');
  panel.setAttribute('aria-hidden', 'true');
  ajustarVistaPanel(false);
}

// En celular (pantalla angosta) el panel es una hoja que cubre la mitad de abajo.
const esMovil = () => window.innerWidth <= 640;

// setViewOffset "corre" la imagen sin mover la cámara. En celular, con el panel
// abierto, dibujamos como si la pantalla empezara un 25% más abajo: el centro de
// la escena queda en la mitad de arriba, visible sobre el panel. En escritorio
// corremos la imagen hacia el espacio libre entre la lista (izquierda) y el
// panel (derecha). Los clics siguen funcionando porque la detección de nodos
// usa esta misma proyección.
const ANCHO_LISTA = 300; // = --ancho-lateral en style.css
const ANCHO_PANEL = 380; // = ancho de .hoja en style.css

function ajustarVistaPanel(panelAbierto = panel.classList.contains('abierto')) {
  const camara = Grafo.camera();
  const W = window.innerWidth;
  const H = window.innerHeight;
  let x = 0;
  let y = 0;
  if (esMovil()) {
    if (panelAbierto) y = H * 0.25;
  } else {
    if (document.getElementById('lista').classList.contains('abierto')) x -= ANCHO_LISTA / 2;
    if (panelAbierto) x += ANCHO_PANEL / 2;
  }
  if (x || y) camara.setViewOffset(W, H, x, y, W, H);
  else camara.clearViewOffset();
  camara.updateProjectionMatrix();
}

el('cerrar').addEventListener('click', limpiarSeleccion);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') limpiarSeleccion();
});

// --- Desarrollar con Claude ----------------------------------
// Armamos el prompt aquí mismo en el navegador y lo abrimos en claude.ai con
// la cuenta del usuario. NO usamos la API: en una página pública la API key
// quedaría visible para cualquiera que abra las herramientas del navegador.

let meta = {}; // datos.meta de graph.json (incluye el perfil)

// Contexto común: perfil + la idea + sus conexiones más fuertes
function contextoNodo(nodo) {
  const conexiones = [...enlacesPorId.get(nodo.id)]
    .map((e) => {
      const otro = idDe(e.source) === nodo.id ? idDe(e.target) : idDe(e.source);
      return { n: nodosPorId.get(otro), s: e.similitud ?? 0 };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  let texto = '';
  if (meta.perfil) texto += `Mi perfil:\n${meta.perfil}\n\n`;
  texto += `Idea de mi "segundo cerebro" (${NOMBRES_CLASE[claseDe(nodo)] ?? nodo.tipo}): ${nodo.titulo}\n`;
  texto += `${nodo.contenido}\n`;
  if (nodo.fuente_url) texto += `Fuente: ${nodo.fuente_url}\n`;
  if (conexiones.length) {
    texto += '\nIdeas relacionadas que tengo anotadas:\n';
    for (const { n } of conexiones) {
      // Solo el primer párrafo de cada una, para no alargar el prompt
      const resumen = String(n.contenido ?? '').split(/\n\s*\n/)[0].slice(0, 300);
      texto += `- ${n.titulo}: ${resumen}\n`;
    }
  }
  return texto;
}

function promptDesarrollo(nodo) {
  return (
    contextoNodo(nodo) +
    '\nSoy estudiante de 4.º año de Ingeniería Civil en Computación e Informática y quiero ' +
    'convertir esta idea en UN proyecto grande, enfocado y viable para aprender, armar mi ' +
    'portafolio y prepararme para mi práctica profesional y mi primer trabajo. Ayúdame con:\n' +
    '1. Visión: qué problema real resuelve, para quién, qué áreas de mi perfil combina ' +
    'y por qué le interesaría a un reclutador.\n' +
    '2. Viabilidad: dificultad, riesgos principales y qué voy a aprender.\n' +
    '3. Alcance: qué incluye la versión 1.0 y qué queda fuera.\n' +
    '4. Arquitectura y stack (preferir opciones gratuitas), justificando cada elección.\n' +
    '5. Un plan de 6 a 8 fases secuenciales, desde el repositorio hasta el despliegue en la ' +
    'nube, que cubra backend y base de datos, frontend, IA o datos, seguridad (OWASP), ' +
    'pruebas y CI/CD. Para cada fase: objetivo, tareas ordenadas, tecnologías, conceptos ' +
    'que aprenderé, entregable, criterio de terminado y un prompt autocontenido listo para ' +
    'copiar que pueda usar contigo (o con Claude Code) para desarrollarla.\n' +
    '6. Prácticas profesionales (Git, pruebas, GitHub Actions, README) y cómo presentarlo ' +
    'en mi CV y en una entrevista.\n' +
    'Sé concreto (nombra herramientas específicas) y explícame las decisiones técnicas: ' +
    'estoy aprendiendo.'
  );
}

function promptPregunta(nodo, pregunta) {
  return contextoNodo(nodo) + `\nMi pregunta sobre esta idea: ${pregunta}`;
}

// Copia SÍNCRONA (termina antes de seguir): un <textarea> oculto + execCommand.
// Es el método antiguo, pero tiene una ventaja clave aquí: funciona dentro del
// mismo clic, ANTES de abrir otra pestaña. Si abriéramos primero la pestaña, la
// página perdería el foco y el navegador bloquearía el acceso al portapapeles.
function copiarSincrono(texto) {
  const area = document.createElement('textarea');
  area.value = texto;
  area.readOnly = true;                 // evita que se abra el teclado en el celular
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.fontSize = '16px';         // evita el zoom automático en iPhone
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, texto.length); // iPhone necesita la selección explícita
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

// Copia "moderna" (navigator.clipboard). Solo funciona en https o localhost.
async function copiar(texto) {
  if (copiarSincrono(texto)) return true;
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

let temporizadorAviso;
function avisar(texto, ms = 2800) {
  const aviso = el('aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, ms);
}

// Copia el prompt y abre un chat NUEVO Y VACÍO en claude.ai para pegarlo.
//
// ¿Por qué no lo mandamos escrito en el link (claude.ai/new?q=...)? Porque
// claude.ai muestra una advertencia de seguridad con esos links: cualquier
// página podría usarlos para meterle a Claude un prompt malicioso escondido
// ("prompt injection"). Pegándolo tú, ves exactamente lo que vas a enviar.
function abrirEnClaude(prompt) {
  const copiado = copiarSincrono(prompt); // primero copiar (ver arriba)
  window.open('https://claude.ai/new', '_blank', 'noopener');
  if (copiado) {
    avisar('Prompt copiado ✓ Pégalo en Claude (Ctrl+V o mantener presionado → Pegar)', 6000);
  } else {
    // Último intento con el método moderno; si falla, el usuario usa "Copiar prompt"
    navigator.clipboard?.writeText(prompt).then(
      () => avisar('Prompt copiado ✓ Pégalo en Claude', 6000),
      () => avisar('No se pudo copiar: usa el botón "Copiar prompt"', 6000),
    );
  }
}

el('btn-abrir-claude').addEventListener('click', () => {
  if (seleccionado) abrirEnClaude(promptDesarrollo(seleccionado));
});

el('btn-copiar-prompt').addEventListener('click', async () => {
  if (!seleccionado) return;
  avisar((await copiar(promptDesarrollo(seleccionado))) ? 'Prompt copiado ✓' : 'No se pudo copiar');
});

el('form-pregunta').addEventListener('submit', (e) => {
  e.preventDefault(); // un <form> recargaría la página al enviarse
  const pregunta = el('input-pregunta').value.trim();
  if (!seleccionado || !pregunta) return;
  abrirEnClaude(promptPregunta(seleccionado, pregunta));
});

// Muestra el plan (Markdown simple) de forma segura: armamos los elementos
// con textContent, nunca con innerHTML. Los bloques ``` son los prompts:
// cada uno lleva su propio botón "Copiar".
function mostrarPlan(nodo) {
  const seccion = el('seccion-plan');
  const contenedorPlan = el('panel-plan');
  contenedorPlan.replaceChildren();
  seccion.hidden = !nodo.plan;
  if (!nodo.plan) return;

  // Partes alternadas: texto, código, texto, código...
  const partes = nodo.plan.replace(/<!--[\s\S]*?-->/g, '').split(/```[^\n]*\n?/);
  partes.forEach((parte, i) => {
    if (i % 2 === 1) {
      const bloque = document.createElement('div');
      bloque.className = 'bloque-prompt';
      const pre = document.createElement('pre');
      pre.textContent = parte.trim();
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'boton-mini';
      boton.textContent = 'Copiar';
      boton.addEventListener('click', async () => {
        avisar((await copiar(pre.textContent)) ? 'Prompt copiado ✓' : 'No se pudo copiar');
      });
      bloque.append(boton, pre);
      contenedorPlan.appendChild(bloque);
      return;
    }
    // Texto: títulos (#) como encabezados y el resto como párrafos
    for (const trozo of parte.split(/\n\s*\n/)) {
      for (const linea of trozo.trim().split('\n')) {
        const titulo = linea.match(/^#{1,4}\s+(.*)/);
        if (titulo) {
          const h = document.createElement('h4');
          h.textContent = titulo[1].replace(/\*\*/g, '');
          contenedorPlan.appendChild(h);
        }
      }
      const resto = trozo.trim().split('\n').filter((l) => !/^#{1,4}\s/.test(l)).join('\n');
      if (resto) {
        const p = document.createElement('p');
        p.textContent = resto.replace(/\*\*/g, ''); // quitamos ** (negritas) para que se lea limpio
        contenedorPlan.appendChild(p);
      }
    }
  });
}

// --- Leyenda --------------------------------------------------

// Icono de estrella para la leyenda y las listas (carácter ✦ con brillo CSS)
function iconoEstrella(color) {
  const icono = document.createElement('span');
  icono.className = 'icono-estrella';
  icono.textContent = '✦';
  icono.style.color = color;
  return icono;
}

function construirLeyenda(nodos) {
  const leyenda = el('leyenda');
  leyenda.replaceChildren(); // se vuelve a construir al agregar un nodo
  for (const [clase, color] of Object.entries(COLORES)) {
    const cantidad = nodos.filter((n) => claseDe(n) === clase).length;
    const li = document.createElement('li');
    const punto = iconoEstrella(color);
    li.append(punto, `${NOMBRES_CLASE[clase]} (${cantidad})`);
    leyenda.appendChild(li);
  }
}

// --- Preferencias de vista (se recuerdan en este navegador) ------------
const CLAVE_VISTA = 'segundo-cerebro.vista';
function leerVista() {
  try { return JSON.parse(localStorage.getItem(CLAVE_VISTA)) ?? {}; } catch { return {}; }
}
function guardarVista(cambios) {
  try { localStorage.setItem(CLAVE_VISTA, JSON.stringify({ ...leerVista(), ...cambios })); } catch { /* sin almacenamiento */ }
}

const nombreTema = (cat) => meta.categorias?.[cat] ?? cat;

// Temas que tienen al menos un nodo, en el orden definido en scripts/cerebro.py
function temasPresentes() {
  const orden = Object.keys(meta.categorias ?? {});
  const posicion = (c) => (orden.includes(c) ? orden.indexOf(c) : orden.length);
  const temas = new Set([...nodosPorId.values()].map(categoriaDe));
  return [...temas].sort((a, b) => posicion(a) - posicion(b));
}

// --- Galaxias: separar las ideas por tema --------------------------
// Cada tema tiene un "centro" en el espacio y una fuerza suave empuja a sus
// nodos hacia él. Encima dibujamos una nebulosa de color y el nombre del tema.
const centrosGalaxia = new Map(); // tema -> { x, y, z }
const decoracionGalaxia = new Map(); // tema -> { nebulosa, etiqueta }

function calcularCentros() {
  centrosGalaxia.clear();
  const temas = temasPresentes();
  const k = temas.length;
  const radio = k <= 1 ? 0 : 60 + 32 * k; // más temas, anillo más grande
  // El anillo se estira según la forma de la pantalla (ancha o vertical)
  const vertical = window.innerWidth < window.innerHeight;
  const [fx, fy] = vertical ? [0.6, 1] : [1, 0.75];
  temas.forEach((tema, i) => {
    const angulo = (i / k) * Math.PI * 2 - Math.PI / 2;
    centrosGalaxia.set(tema, {
      x: Math.cos(angulo) * radio * fx,
      y: Math.sin(angulo) * radio * fy,
      z: (i % 2 ? -1 : 1) * radio * 0.15, // un poco de profundidad
    });
  });
}

// Fuerza de d3 escrita a mano: en cada paso acerca cada nodo al centro de su galaxia
function fuerzaGalaxias() {
  let nodos = [];
  function fuerza(alfa) {
    const k = 0.12 * alfa;
    for (const n of nodos) {
      const c = centrosGalaxia.get(categoriaDe(n));
      if (!c) continue;
      n.vx += (c.x - n.x) * k;
      n.vy += (c.y - n.y) * k;
      n.vz += (c.z - n.z) * k;
    }
  }
  fuerza.initialize = (lista) => { nodos = lista; };
  return fuerza;
}

// Texto como imagen (sprite): siempre mira a la cámara
function crearEtiqueta(texto, color) {
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d');
  const fuente = '600 44px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.font = fuente;
  lienzo.width = Math.ceil(ctx.measureText(texto).width) + 48;
  lienzo.height = 80;
  ctx.font = fuente; // cambiar el tamaño del lienzo borra la configuración
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Color del tema y sin brillo propio: el efecto bloom ya le agrega halo, y si
  // el texto fuera blanco puro el halo lo dejaría ilegible.
  ctx.fillStyle = conAlfa(color, 0.75);
  ctx.fillText(texto, lienzo.width / 2, lienzo.height / 2);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textura, transparent: true, depthWrite: false, opacity: 0.85,
  }));
  sprite.userData.proporcion = lienzo.width / lienzo.height; // para escalarlo sin deformar
  return sprite;
}

// Nebulosa: un brillo difuso del color del tema detrás de sus estrellas
function crearNebulosa(color) {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 256;
  const ctx = lienzo.getContext('2d');
  // Degradado suave (muchas paradas) para que no se note el borde del disco
  const degradado = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  degradado.addColorStop(0, conAlfa(color, 0.16));
  degradado.addColorStop(0.3, conAlfa(color, 0.09));
  degradado.addColorStop(0.6, conAlfa(color, 0.03));
  degradado.addColorStop(1, conAlfa(color, 0));
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, 256, 256);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: textura, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

function crearDecoracionGalaxias() {
  quitarDecoracionGalaxias();
  for (const tema of centrosGalaxia.keys()) {
    const color = colorTema(tema);
    const nebulosa = crearNebulosa(color);
    const etiqueta = crearEtiqueta(nombreTema(tema), color);
    Grafo.scene().add(nebulosa, etiqueta);
    decoracionGalaxia.set(tema, { nebulosa, etiqueta });
  }
  moverDecoracionGalaxias();
}

function quitarDecoracionGalaxias() {
  for (const { nebulosa, etiqueta } of decoracionGalaxia.values()) {
    for (const sprite of [nebulosa, etiqueta]) {
      Grafo.scene().remove(sprite);
      sprite.material.map.dispose();
      sprite.material.dispose();
    }
  }
  decoracionGalaxia.clear();
}

// La nebulosa y el nombre siguen al grupo real de estrellas (centro y tamaño)
function moverDecoracionGalaxias() {
  const grupos = new Map();
  for (const n of nodosPorId.values()) {
    if (n.x == null) continue;
    const tema = categoriaDe(n);
    if (!grupos.has(tema)) grupos.set(tema, []);
    grupos.get(tema).push(n);
  }
  for (const [tema, { nebulosa, etiqueta }] of decoracionGalaxia) {
    const nodos = grupos.get(tema);
    if (!nodos?.length) continue;
    const c = { x: 0, y: 0, z: 0 };
    for (const n of nodos) { c.x += n.x; c.y += n.y; c.z += n.z; }
    c.x /= nodos.length; c.y /= nodos.length; c.z /= nodos.length;
    let radio = 0;
    for (const n of nodos) radio = Math.max(radio, Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z));
    radio += 14;
    nebulosa.position.set(c.x, c.y, c.z);
    nebulosa.scale.setScalar(radio * 2.4);
    // El nombre crece con la galaxia, así se lee desde lejos
    const alto = Math.min(18, Math.max(8, radio * 0.2));
    etiqueta.scale.set(alto * etiqueta.userData.proporcion, alto, 1);
    etiqueta.position.set(c.x, c.y + radio + alto, c.z);
  }
}

function aplicarGalaxias(activar, animar = true) {
  modoGalaxias = activar;
  guardarVista({ galaxias: activar });
  const boton = el('btn-galaxias');
  boton.setAttribute('aria-pressed', String(activar));
  boton.textContent = activar ? '✦ Juntar ideas' : '🌌 Separar en galaxias';

  if (activar) {
    calcularCentros();
    Grafo.d3Force('galaxias', fuerzaGalaxias());
    crearDecoracionGalaxias();
  } else {
    Grafo.d3Force('galaxias', null);
    quitarDecoracionGalaxias();
  }
  Grafo.d3Force('link').strength(fuerzaEnlace); // recalcula las fuerzas de los enlaces
  refrescarEstilos();
  if (animar) {
    encuadrarAlParar = true;
    Grafo.d3ReheatSimulation(); // vuelve a mover la física para que se acomoden
  }
}

el('btn-galaxias').addEventListener('click', () => aplicarGalaxias(!modoGalaxias));

// --- Lista lateral: ideas agrupadas por tema ----------------------
const lista = el('lista');
const temasCerrados = new Set(leerVista().temasCerrados ?? []);

function abrirLista(abrir) {
  lista.classList.toggle('abierto', abrir);
  lista.setAttribute('aria-hidden', String(!abrir));
  document.body.classList.toggle('lista-abierta', abrir);
  el('btn-lista').setAttribute('aria-expanded', String(abrir));
  ajustarVistaPanel();
  if (!esMovil()) guardarVista({ lista: abrir }); // en celular empieza siempre cerrada
  if (abrir && !esMovil()) el('buscar').focus({ preventScroll: true });
}

// Para buscar sin importar mayúsculas ni tildes ("logica" encuentra "Lógica")
const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function construirLista() {
  const filtro = normalizar(el('buscar').value.trim());
  const contenedor = el('lista-secciones');
  contenedor.replaceChildren();
  let total = 0;

  for (const tema of temasPresentes()) {
    const nodos = [...nodosPorId.values()]
      .filter((n) => categoriaDe(n) === tema)
      .filter((n) => !filtro || normalizar(`${n.titulo} ${n.contenido}`).includes(filtro))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    if (!nodos.length) continue;
    total += nodos.length;

    const seccion = document.createElement('details');
    seccion.className = 'seccion';
    seccion.open = Boolean(filtro) || !temasCerrados.has(tema); // al buscar, todo abierto
    seccion.addEventListener('toggle', () => {
      if (filtro) return;
      if (seccion.open) temasCerrados.delete(tema); else temasCerrados.add(tema);
      guardarVista({ temasCerrados: [...temasCerrados] });
    });

    const resumen = document.createElement('summary');
    const punto = document.createElement('span');
    punto.className = 'punto-tema';
    punto.style.background = colorTema(tema);
    const cuenta = document.createElement('span');
    cuenta.className = 'cuenta';
    cuenta.textContent = String(nodos.length);
    resumen.append(punto, nombreTema(tema), cuenta);

    const ul = document.createElement('ul');
    ul.className = 'lista-nodos';
    for (const nodo of nodos) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.dataset.id = nodo.id;
      const nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = nodo.titulo;
      const origen = document.createElement('span');
      origen.className = 'origen';
      origen.textContent = NOMBRES_CLASE[claseDe(nodo)] ?? '';
      boton.append(iconoEstrella(colorDe(nodo)), nombre, origen);
      boton.addEventListener('click', () => {
        seleccionarNodo(nodo);
        if (esMovil()) abrirLista(false); // en celular la lista tapa todo: la cerramos
      });
      const li = document.createElement('li');
      li.appendChild(boton);
      ul.appendChild(li);
    }
    seccion.append(resumen, ul);
    contenedor.appendChild(seccion);
  }

  if (!total) {
    const vacio = document.createElement('p');
    vacio.className = 'lista-vacia';
    vacio.textContent = filtro ? 'Ninguna idea coincide con la búsqueda.' : 'Todavía no hay ideas.';
    contenedor.appendChild(vacio);
  }
  marcarEnLista();
}

// Resalta en la lista el nodo seleccionado en el grafo
function marcarEnLista() {
  for (const boton of el('lista-secciones').querySelectorAll('button[data-id]')) {
    const actual = seleccionado?.id === boton.dataset.id;
    boton.setAttribute('aria-current', String(actual));
    if (actual && lista.classList.contains('abierto')) boton.scrollIntoView({ block: 'nearest' });
  }
}

el('btn-lista').addEventListener('click', () => abrirLista(!lista.classList.contains('abierto')));
el('cerrar-lista').addEventListener('click', () => abrirLista(false));
el('buscar').addEventListener('input', construirLista);

// --- Carga de datos -------------------------------------------

async function cargar() {
  try {
    // no-cache: si reconstruyes graph.json, el navegador no muestra la versión vieja
    const respuesta = await fetch('graph.json', { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();

    meta = datos.meta ?? {};
    construirIndices(datos);
    construirLeyenda(datos.nodes);
    Grafo.graphData(datos);
    construirLista();

    // Restaurar la vista que tenías la última vez
    const vista = leerVista();
    if (vista.lista && !esMovil()) abrirLista(true);
    if (vista.galaxias) {
      aplicarGalaxias(true, false);
      encuadrarAlParar = true; // volver a encuadrar cuando las galaxias se acomoden
    }

    // Distancia inicial razonable según la cantidad de nodos (sin animación).
    // Es un "piso" por si el encuadre suave no alcanza a correr; con más
    // nodos el grafo ocupa más espacio, por eso crece con la raíz cúbica.
    Grafo.cameraPosition({ x: 0, y: 0, z: 110 * Math.cbrt(datos.nodes.length) });
  } catch (err) {
    console.error(err);
    const caja = el('error');
    caja.innerHTML =
      '<strong>No se pudo cargar <code>graph.json</code>.</strong><br>' +
      'Si abriste el archivo con doble clic, el navegador bloquea la carga. ' +
      'Corre <code>python3 -m http.server 8000</code> dentro de <code>web/</code> ' +
      'y abre <code>http://localhost:8000</code>.';
    caja.hidden = false;
  }
}

// --- Agregar fuentes desde la web ----------------------------------

const hojaAgregar = iniciarAgregar({
  obtenerNodos: () => [...nodosPorId.values()],
  alAbrir: limpiarSeleccion,
  avisar,
});

cargar();
