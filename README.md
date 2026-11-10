# 🧠 Segundo Cerebro

> Un grafo 3D de ideas que aprende de los links y videos que le doy,
> combina ideas relacionadas y me propone nuevas ideas.

## Estado del proyecto

🚧 En construcción: fase 1 ✅ · fase 2 en prueba.

👉 **Ver en vivo:** https://arrobaaas.github.io/segundo-cerebro/web/

## Fases

| # | Fase | Descripción |
|---|------|-------------|
| 1 | Visor 3D | Web con graph.json de ejemplo: rotación, zoom, clic en nodo, panel de detalle, colores por tipo |
| 2 | Ideas manuales | `scripts/agregar_idea.py` genera el .md; `scripts/build_graph.py` calcula embeddings, enlaces por similitud y exporta graph.json |
| 3 | Aprender de links | `scripts/agregar_fuente.py <url>` → transcript YouTube / texto web → resumen con Claude → nodo fuente → rebuild |
| 4 | Ideas fusionadas | `scripts/fusionar.py "pedido"` → busca nodos similares → Claude fusiona → guarda en /fusionadas → rebuild |
| 5 | Extras | GitHub Action, buscador en web, slider de umbral de similitud |

## Stack

- **Frontend**: HTML + JS + [3d-force-graph](https://github.com/vasturiano/3d-force-graph) (Three.js + física de fuerzas). Sin framework. GitHub Pages.
- **Datos**: Markdown con frontmatter por nodo en `ideas/`, `fuentes/` y `fusionadas/`.
- **Procesamiento**: Python (`build_graph.py`, `agregar_fuente.py`, `fusionar.py`).
- **Similitud**: embeddings con `sentence-transformers` (paraphrase-multilingual-MiniLM-L12-v2), umbral de similitud configurable.
- **IA generativa**: API de Claude (Anthropic) para resumir fuentes y fusionar ideas. La key va en `.env` (gitignored).

## Puesta en marcha

```bash
# entorno Python
python3 -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # sin GPU: versión liviana
pip install -r requirements.txt

# visor 3D (fase 1)
cd web
python3 -m http.server 8000
# abrir http://localhost:8000
```

> ¿Por qué un servidor y no doble clic en `index.html`? Por seguridad, el navegador
> bloquea `fetch()` de archivos locales (`file://`), así que no podría leer `graph.json`.

### Probar en el celular

Con el servidor corriendo y el celular en el **mismo wifi** que el computador:

```bash
hostname -I   # muestra la IP local, por ejemplo 192.168.1.23
```

Abre `http://<esa-IP>:8000` en el navegador del celular.

## Agregar ideas y reconstruir el grafo (fase 2)

Con el entorno activado (`source .venv/bin/activate`):

```bash
# Crear una idea (genera ideas/idea-XXX.md y reconstruye graph.json)
python scripts/agregar_idea.py "Título de la idea" -c "Contenido de la idea"

# Sin -c te pide el contenido (varias líneas, termina con Ctrl+D)
python scripts/agregar_idea.py "Título de la idea"

# Reconstruir el grafo a mano (por ejemplo, después de editar un .md)
python scripts/build_graph.py
python scripts/build_graph.py --umbral 0.4   # más conexiones
```

También puedes crear o editar los `.md` a mano: `build_graph.py` lee todo lo
que haya en `ideas/`, `fuentes/` y `fusionadas/`.

### Cómo se conectan los nodos

1. Cada nodo (título + contenido) se convierte en un **embedding**: un vector de
   384 números que representa su significado.
2. Se compara cada par de nodos con **similitud coseno** (1 = mismo significado, 0 = nada que ver).
3. Si la similitud supera el **umbral** (por defecto 0.45), se crea un enlace.
4. Un nodo que queda sin enlaces se conecta con su **vecino más parecido**,
   si la similitud es al menos 0.3, para que no quede flotando solo.
5. Las ideas fusionadas siempre se enlazan con sus `padres`.

> **¿Por qué 0.45 y no 0.6?** Con este modelo y textos cortos en español, la
> mediana de similitud entre pares ronda 0.3 y casi ningún par pasa 0.6, aunque
> hablen del mismo tema. Al construir, el script muestra mín/mediana/máx para
> que puedas ajustar el umbral a medida que crece tu grafo.

## Formato de un nodo (`.md`)

```markdown
---
id: idea-007
titulo: Mi idea
tipo: idea            # idea | fuente | fusionada (debe calzar con la carpeta)
fecha: '2026-11-09'
fuente_url: null      # URL si es una fuente
padres: []            # ids de origen si es una fusionada
---

El contenido de la idea en texto libre.
```

## Formato de `graph.json`

Es el "contrato" entre los scripts de Python (que lo generan) y la web (que lo dibuja):

```json
{
  "meta": { "generado": "2026-11-09T23:40:00", "modelo": "...", "umbral": 0.45 },
  "nodes": [
    { "id": "idea-001", "titulo": "...", "tipo": "idea | fuente | fusionada",
      "contenido": "...", "fecha": "2026-11-09", "fuente_url": null, "padres": [] }
  ],
  "links": [
    { "source": "idea-001", "target": "fuente-001", "similitud": 0.82, "tipo": "similitud | padre" }
  ]
}
```

Los enlaces `padre` unen una idea fusionada con los nodos que la originaron.

## Estructura

```
segundo-cerebro/
├── ideas/        # nodos de ideas (Markdown + frontmatter)
├── fuentes/      # links y videos (Markdown + frontmatter)
├── fusionadas/   # ideas generadas por IA (Markdown + frontmatter)
├── scripts/      # cerebro.py (común), agregar_idea.py, build_graph.py, ...
├── web/          # index.html, app.js, style.css, graph.json
├── requirements.txt
├── .env.example
└── .gitignore
```
