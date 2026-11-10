# 🧠 Segundo Cerebro

> Un grafo 3D de ideas que aprende de los links y videos que le doy,
> combina ideas relacionadas y me propone nuevas ideas.

## Estado del proyecto

🚧 En construcción (Fase 1 de 5 en curso).

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
python -m venv .venv
source .venv/bin/activate
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

## Formato de `graph.json`

Es el "contrato" entre los scripts de Python (que lo generan) y la web (que lo dibuja):

```json
{
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
├── scripts/      # build_graph.py, agregar_fuente.py, fusionar.py
├── web/          # index.html, app.js, style.css, graph.json
├── requirements.txt
├── .env.example
└── .gitignore
```
