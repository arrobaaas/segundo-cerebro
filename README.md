# 🧠 Segundo Cerebro

> Un grafo 3D de ideas que aprende de los links y videos que le doy,
> combina ideas relacionadas y me propone nuevas ideas.

## Estado del proyecto

🚧 En construcción: fase 1 ✅ · fase 2 ✅ · fase 3 en prueba.

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

## Aprender de links y desarrollar ideas con Claude (fase 3)

Todo el cerebro está orientado a **proyectos viables para mi carrera de Informática**.
Claude recibe siempre el contexto de [`perfil.md`](perfil.md): edítalo con tu año,
tecnologías y tiempo disponible para que las respuestas sean para ti.

### Desde la página web (botón **＋ Fuente**)

Funciona también desde el celular, sin terminal:

1. **Conectar GitHub (una vez por dispositivo):** crea un
   [token fine-grained](https://github.com/settings/personal-access-tokens/new) con acceso
   *solo* a este repositorio y permiso **Contents: Read and write**, y pégalo en la página.
   Se guarda únicamente en ese navegador (`localStorage`), nunca en el código.
2. Pega un link (**artículo, página web o video de YouTube**) o elige **PDF** y sube el
   archivo → **Agregar al cerebro ✦**. Todo es automático: no hay que copiar prompts.
   - La página deja `pendientes/<id>.json` en el repo (los PDF van **cifrados** en
     `pendientes/<id>.bin`: el repo es público, pero solo la Action puede leerlos).
   - La GitHub Action [`construir-grafo`](.github/workflows/construir-grafo.yml) saca la
     transcripción del video, el texto de la página o lee el PDF, lo resume con la API de
     Claude, crea `fuentes/fuente-XXX.md` y recalcula el grafo.
   - La página muestra una **barra con el porcentaje de avance** (sigue cada paso de la
     Action) y se recarga sola con las estrellas nuevas en 2-4 minutos. Si algo falla,
     muestra el error.

#### Configuración del modo automático (una vez)

1. **Conectar Claude con tu suscripción (Pro/Max, sin costo extra):** en la terminal corre
   `claude setup-token`, inicia sesión y copia el token que muestra. Guárdalo como secreto:
   `gh secret set CLAUDE_CODE_OAUTH_TOKEN` (pégalo cuando lo pida). La Action usa Claude
   Code en modo no interactivo (`claude -p`, solo con permiso de *leer* archivos) y lo que
   proceses cuenta dentro de los límites de uso de tu plan.
2. *(Alternativa de pago)* Si prefieres la API, guarda una key de
   [console.anthropic.com](https://console.anthropic.com/) como secreto `ANTHROPIC_API_KEY`.
   Si existe, se usa en vez de la suscripción.
3. Para los PDF: guarda la clave privada de descifrado como secreto `PDF_PRIVATE_KEY`
   (su pareja pública está en `web/agregar.js`). Para generar un par nuevo:
   `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out privada.pem`, guarda
   `privada.pem` con `gh secret set PDF_PRIVATE_KEY < privada.pem`, pega en
   `CLAVE_PUBLICA_PDF` el resultado de
   `openssl pkey -in privada.pem -pubout -outform DER | base64 -w0` y borra `privada.pem`.
4. *(Opcional)* Si YouTube bloquea a los servidores de GitHub ("YouTube está bloqueando
   las solicitudes"), agrega el secreto `YOUTUBE_PROXY` con la dirección de un proxy
   (`http://usuario:clave@host:puerto`).

> **Seguridad del token:** si alguien lo obtuviera, solo podría modificar este repositorio.
> Ponle fecha de expiración y, si lo pierdes, revócalo en GitHub → Settings → Developer settings.

### GitHub Action: el grafo se reconstruye solo

Cada push que cambia `ideas/`, `fuentes/`, `fusionadas/`, `planes/`, `perfil.md` o `scripts/`
ejecuta `build_graph.py` en los servidores de GitHub y sube el `graph.json` nuevo.
Por eso, **antes de trabajar desde la terminal, haz `git pull`** para traer el último
`graph.json` y evitar conflictos.

### Modo gratis con claude.ai desde la terminal (`--manual`)

No necesitas API key: el script prepara el prompt, lo llevas a tu cuenta de
[claude.ai](https://claude.ai/new) y le devuelves la respuesta.

```bash
python scripts/agregar_fuente.py "https://www.youtube.com/watch?v=..." --manual
python scripts/desarrollar.py idea-002 --manual           # plan → planes/idea-002.md
python scripts/desarrollar.py idea-002 --manual -p "¿Python o JavaScript?"
```

1. El script extrae el video o artículo y arma el prompt (tu perfil + la fuente + el formato).
2. **Con `xclip` instalado** (`sudo apt install xclip`) el prompt queda copiado: pégalo en
   claude.ai. **Sin xclip**, arrastra el archivo `.cache/prompt_fuente.txt` al chat.
3. Copia la respuesta de Claude (botón *Copy*) y vuelve a la terminal:
   con xclip basta presionar Enter; sin xclip pégala y termina con Enter + Ctrl+D.
4. El script valida el JSON (si está incompleto te deja reintentar) y crea el nodo.

### Modo automático con la API (de pago)

#### Configurar la API key (una sola vez)

```bash
cp .env.example .env
nano .env          # pega tu key de https://console.anthropic.com/
```

`.env` está en `.gitignore`: **nunca** se sube al repositorio.

#### Agregar una fuente (video o artículo)

```bash
python scripts/agregar_fuente.py "https://www.youtube.com/watch?v=..."
python scripts/agregar_fuente.py "https://un-blog.com/articulo"
```

1. **YouTube** → transcripción con `youtube-transcript-api` (prefiere español, luego inglés,
   luego cualquier idioma). **Web** → texto principal con `trafilatura`.
2. Claude devuelve (en JSON validado): título, resumen, aprendizajes, **ideas de proyecto
   viables** con su MVP, y tecnologías.
3. Se guarda en `fuentes/fuente-XXX.md` y se reconstruye el grafo.

Si la URL ya existe no se vuelve a procesar (usa `--forzar`). Cada fuente cuesta
aprox. US$0,03–0,10 según el largo (el script muestra el costo exacto).

### Desarrollar una idea con Claude

**Desde la web (gratis, sin API key):** al abrir un nodo, la sección *Desarrollar con Claude*
arma un prompt con tu perfil, la idea y sus conexiones:
- **Copiar y abrir Claude ↗** copia el prompt y abre un chat nuevo: lo pegas, lo revisas y lo envías.
- **Copiar prompt** para pegarlo donde quieras (Claude, Claude Code…).
- **Preguntar ↗** hace lo mismo con tu pregunta sobre esa idea.

> No usamos links `claude.ai/new?q=...` con el prompt adentro: claude.ai muestra una
> advertencia con esos links, porque una página maliciosa podría usarlos para meterle a
> Claude un prompt escondido (*prompt injection*). Pegándolo tú, ves lo que envías.

> La web no usa la API a propósito: en una página pública la API key quedaría visible.

**Desde la terminal** (con API, o gratis agregando `--manual`):

```bash
python scripts/desarrollar.py idea-002                     # plan completo → planes/idea-002.md
python scripts/desarrollar.py idea-002 -p "¿Qué base de datos uso?"   # pregunta rápida
```

El plan incluye viabilidad, MVP, stack, etapas con **un prompt listo por etapa**, cómo
mostrarlo en el portafolio y siguientes pasos. Aparece en el panel de la web con un
botón *Copiar* en cada prompt.

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
├── planes/       # planes de desarrollo generados por desarrollar.py
├── .githooks/    # pre-commit: bloquea commits con claves
├── scripts/      # cerebro.py, claude_cliente.py, manual.py, descargar_librerias.py, agregar_idea.py, agregar_fuente.py, desarrollar.py, build_graph.py
├── web/          # index.html, app.js, agregar.js, style.css, graph.json, vendor/ (librerías)
├── perfil.md     # tu contexto para Claude (carrera, nivel, metas)
├── requirements.txt
├── .env.example
└── .gitignore
```

## Seguridad

**Las visitas solo pueden mirar.** La página no tiene ninguna API key, el botón **＋ Fuente**
solo aparece en tus dispositivos, y para guardar en el repo hace falta un token que solo
tú puedes crear. Si una visita usa "Copiar y abrir Claude", se abre *su propia* cuenta de claude.ai.

| Qué | Cómo se protege |
|---|---|
| Claves de Claude (token de suscripción o API key) | En `.env` (local, en `.gitignore`) o como **secretos** de GitHub para la Action. Nunca en la web ni en el repo; solo existen en el paso que las usa. Claude Code corre solo con la herramienta Read (no ejecuta comandos) |
| Subir una clave por error | Hook `pre-commit` local (bloquea claves y `.env`) + *secret scanning* con *push protection* de GitHub |
| Token de GitHub | Solo *fine-grained* (un repo, permiso *Contents*); se rechazan los clásicos `ghp_`. Vive solo en el `localStorage` de tu navegador |
| Código de terceros | Librerías JS dentro del repo (`web/vendor/`, con sus huellas SHA-256 en `versiones.json`), sin CDN |
| Inyección de código (XSS) | Todo el texto se inserta con `textContent`; la CSP prohíbe scripts externos e *inline* |
| GitHub Action | Solo corre con pushes a `main` (solo tú puedes, con tu token); Actions fijadas a un commit (SHA); permisos mínimos; máximo 10 links por ejecución para no gastar de más; los links se validan (`http(s)` solamente) |

**Al clonar el repo en otro computador**, activa el hook:

```bash
git config core.hooksPath .githooks
```

**Para conectar un dispositivo nuevo** (celular, otro navegador), abre la página con
`#editar` al final: `https://arrobaaas.github.io/segundo-cerebro/web/#editar`.
Crea el token con **fecha de expiración** (ej. 90 días). Si pierdes un dispositivo, revoca el
token en GitHub → *Settings* → *Developer settings* → *Personal access tokens*.

> ⚠ **El repositorio es público**: cualquiera puede leer tus ideas, fuentes y `perfil.md`.
> No guardes ahí nada privado.
