// ============================================================
// Segundo Cerebro — visor 3D
// Carga graph.json, dibuja el grafo con 3d-force-graph y maneja
// la selección de nodos (panel de detalle + resaltado de conexiones).
// ============================================================

// --- Configuración visual ------------------------------------

// Un color por tipo de nodo (los mismos de style.css)
const COLORES = {
  idea: '#a855f7',      // morado
  fuente: '#f97316',    // naranjo
  fusionada: '#22c55e', // verde
};
const NOMBRES_TIPO = { idea: 'Idea', fuente: 'Fuente', fusionada: 'Fusionada' };
const COLOR_DESCONOCIDO = '#888888';

const OPACIDAD_ATENUADA = 0.12; // qué tan "apagado" queda lo que no está conectado
const DISTANCIA_CAMARA = 90;    // a qué distancia queda la cámara al enfocar un nodo

// --- Estado ---------------------------------------------------

const nodosPorId = new Map();     // id -> objeto nodo
const vecinosPorId = new Map();   // id -> Set de ids vecinos
const enlacesPorId = new Map();   // id -> Set de objetos enlace que lo tocan

let seleccionado = null;          // nodo actualmente seleccionado (o null)
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

const colorDeTipo = (tipo) => COLORES[tipo] ?? COLOR_DESCONOCIDO;

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

function colorNodo(nodo) {
  const base = colorDeTipo(nodo.tipo);
  if (!seleccionado || nodosResaltados.has(nodo)) return base;
  return conAlfa(base, OPACIDAD_ATENUADA);
}

// Tamaño: crece con la cantidad de conexiones (los "hubs" se ven más grandes)
function tamanoNodo(nodo) {
  return 2 + (vecinosPorId.get(nodo.id)?.size ?? 0) * 0.8;
}

function colorEnlace(enlace) {
  // Los enlaces "padre" (fusionada -> origen) van en verde suave
  const base = enlace.tipo === 'padre' ? '#4ade80' : '#c4c4d4';
  if (!seleccionado) return conAlfa(base, 0.35);
  return enlacesResaltados.has(enlace) ? conAlfa(base, 0.95) : conAlfa(base, 0.04);
}

// Grosor según la similitud: entre más parecidas las ideas, más grueso
function anchoEnlace(enlace) {
  const s = enlace.similitud ?? 0.6;
  const ancho = 0.3 + (s - 0.5) * 2; // ~0.5 a ~1.3
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
  .nodeColor(colorNodo)
  .nodeVal(tamanoNodo)
  .nodeOpacity(0.95)
  .nodeResolution(16)
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
Grafo.d3Force('link').distance((e) => 25 + (1 - (e.similitud ?? 0.6)) * 120);

// Cuando la simulación termina por primera vez, encuadramos todo el grafo
let yaEncuadrado = false;
Grafo.onEngineStop(() => {
  if (!yaEncuadrado) {
    Grafo.zoomToFit(800, 40);
    yaEncuadrado = true;
  }
});

// Ajustar el tamaño al girar el celular o cambiar el tamaño de la ventana
window.addEventListener('resize', () => {
  Grafo.width(window.innerWidth).height(window.innerHeight);
});

// --- Selección ------------------------------------------------

// Vuelve a pedir colores/anchos a la librería después de cambiar el resaltado
function refrescarEstilos() {
  Grafo.nodeColor(Grafo.nodeColor())
    .linkColor(Grafo.linkColor())
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
  enfocarCamara(nodo);
  mostrarPanel(nodo);
}

function limpiarSeleccion() {
  if (!seleccionado) return;
  seleccionado = null;
  nodosResaltados.clear();
  enlacesResaltados.clear();
  refrescarEstilos();
  ocultarPanel();
}

// Mueve la cámara hacia el nodo, sobre la línea que va del centro al nodo
function enfocarCamara(nodo) {
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
  chip.textContent = NOMBRES_TIPO[nodo.tipo] ?? nodo.tipo;
  chip.style.background = colorDeTipo(nodo.tipo);

  el('panel-titulo').textContent = nodo.titulo;
  el('panel-meta').textContent = nodo.fecha ? `📅 ${nodo.fecha}` : '';

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

    const punto = document.createElement('span');
    punto.className = 'punto';
    punto.style.background = colorDeTipo(nodo.tipo);

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
}

el('cerrar').addEventListener('click', limpiarSeleccion);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') limpiarSeleccion();
});

// --- Leyenda --------------------------------------------------

function construirLeyenda(nodos) {
  const leyenda = el('leyenda');
  for (const [tipo, color] of Object.entries(COLORES)) {
    const cantidad = nodos.filter((n) => n.tipo === tipo).length;
    const li = document.createElement('li');
    const punto = document.createElement('span');
    punto.className = 'punto';
    punto.style.background = color;
    li.append(punto, `${NOMBRES_TIPO[tipo]} (${cantidad})`);
    leyenda.appendChild(li);
  }
}

// --- Carga de datos -------------------------------------------

async function cargar() {
  try {
    // no-cache: si reconstruyes graph.json, el navegador no muestra la versión vieja
    const respuesta = await fetch('graph.json', { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();

    construirIndices(datos);
    construirLeyenda(datos.nodes);
    Grafo.graphData(datos);

    // Gracias a warmupTicks las posiciones ya están casi listas: encuadramos
    // pronto sin esperar a que la simulación termine del todo.
    setTimeout(() => {
      if (!yaEncuadrado) { Grafo.zoomToFit(800, 40); yaEncuadrado = true; }
    }, 300);
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

cargar();
