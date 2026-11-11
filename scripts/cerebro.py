"""
Módulo común del Segundo Cerebro.

Todo lo que comparten los scripts vive aquí: rutas de carpetas, cómo se lee
y escribe un nodo en Markdown, y cómo se genera el siguiente id.
Así, si mañana cambia el formato, se corrige en un solo lugar.

Formato de cada nodo (archivo .md):

    ---
    id: idea-007
    titulo: Mi idea
    tipo: idea
    fecha: '2026-11-09'
    fuente_url: null
    padres: []
    categoria: web        # opcional: tema (ver CATEGORIAS); si falta se asigna sola
    origen: video         # solo fuentes: video | web | pdf (si falta, se deduce del link)
    ---
    Aquí va el contenido en texto libre (Markdown).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import frontmatter  # lee/escribe Markdown con un bloque YAML al inicio

# --- Rutas ---------------------------------------------------------------
# Path(__file__) es este archivo; .parent.parent sube de scripts/ a la raíz.
RAIZ = Path(__file__).resolve().parent.parent

# Cada tipo de nodo vive en su propia carpeta
CARPETAS = {
    "idea": RAIZ / "ideas",
    "fuente": RAIZ / "fuentes",
    "fusionada": RAIZ / "fusionadas",
}
TIPOS = tuple(CARPETAS)

GRAPH_JSON = RAIZ / "web" / "graph.json"

# Temas para agrupar las ideas en "galaxias" y en la lista de la página.
# clave: (nombre visible, descripción). La descripción sirve para clasificar
# solo (por significado, con embeddings) los nodos que no traen categoría.
CATEGORIAS = {
    "web": ("Desarrollo web", "desarrollo web, páginas y aplicaciones web, frontend, backend, "
            "APIs REST, HTML, CSS, JavaScript, frameworks web"),
    "ia": ("Inteligencia artificial", "inteligencia artificial, machine learning, redes neuronales, "
           "modelos de lenguaje, chatbots, RAG, visión por computador"),
    "datos": ("Datos", "análisis de datos, bases de datos, SQL, dashboards, métricas, estadística, "
              "visualización de datos, ETL"),
    "ciberseguridad": ("Ciberseguridad", "seguridad informática, hacking ético, vulnerabilidades, "
                       "criptografía, pentesting, OWASP, malware, redes seguras"),
    "juegos": ("Videojuegos", "videojuegos, desarrollo de juegos, Unity, Godot, gráficos, "
               "jugabilidad, juegos"),
    "movil": ("Apps móviles", "aplicaciones móviles, Android, iOS, Flutter, React Native, celular"),
    "nube": ("Nube y DevOps", "nube, AWS, Azure, Google Cloud, Docker, Kubernetes, CI/CD, "
             "despliegue, servidores, DevOps"),
    "automatizacion": ("Bots y automatización", "bots de Discord o Telegram, automatización de "
                       "tareas, scripts, scraping, integraciones entre servicios"),
    "carrera": ("Carrera y portafolio", "carrera profesional, portafolio, CV, entrevistas, "
                "práctica profesional, búsqueda de empleo, habilidades"),
    "otros": ("Otros", ""),
}

# De dónde salió una fuente: video de YouTube, página web o PDF
ORIGENES = ("video", "web", "pdf")


def origen_de_url(url: str | None) -> str:
    """Deduce el origen de una fuente por su link (para fuentes antiguas sin 'origen')."""
    u = (url or "").lower()
    if "youtube.com" in u or "youtu.be" in u:
        return "video"
    if u.split("?")[0].endswith(".pdf"):
        return "pdf"
    return "web" if u else "pdf"  # sin link solo llegan PDFs subidos desde la página
PERFIL = RAIZ / "perfil.md"        # contexto sobre ti que se le da a Claude
PLANES = RAIZ / "planes"           # planes de desarrollo generados por desarrollar.py


def leer_perfil() -> str:
    """Texto de perfil.md (o un perfil genérico si no existe)."""
    if PERFIL.exists():
        texto = PERFIL.read_text(encoding="utf-8")
        # Quitamos los comentarios <!-- ... --> (notas para ti, no para Claude)
        # y el título "# Mi perfil", que no aporta información.
        texto = re.sub(r"<!--.*?-->", "", texto, flags=re.DOTALL)
        texto = re.sub(r"^#\s.*$", "", texto, flags=re.MULTILINE)
        return re.sub(r"\n{3,}", "\n\n", texto).strip()
    return "Estudiante de Ingeniería en Informática."


def ruta_plan(id_nodo: str) -> Path:
    return PLANES / f"{id_nodo}.md"


# --- Modelo de datos -----------------------------------------------------
@dataclass
class Nodo:
    """Un nodo del grafo, tal como está guardado en su archivo .md."""

    id: str
    titulo: str
    tipo: str
    fecha: str
    contenido: str
    fuente_url: str | None = None
    padres: list[str] = field(default_factory=list)
    categoria: str | None = None  # clave de CATEGORIAS (None = se asigna sola)
    origen: str | None = None     # solo fuentes: video | web | pdf
    ruta: Path | None = None  # archivo de origen (no se exporta)

    def texto_para_embedding(self) -> str:
        """Texto que representa el significado del nodo: título + contenido."""
        return f"{self.titulo}. {self.contenido}".strip()

    def a_dict(self) -> dict:
        """Diccionario con el formato de graph.json (el "contrato" con la web)."""
        return {
            "id": self.id,
            "titulo": self.titulo,
            "tipo": self.tipo,
            "contenido": self.contenido,
            "fecha": self.fecha,
            "fuente_url": self.fuente_url,
            "padres": self.padres,
            "categoria": self.categoria,
            "origen": self.origen,
        }


class ErrorNodo(Exception):
    """Un archivo .md tiene un problema (falta un campo, tipo inválido, etc.)."""


# --- Lectura -------------------------------------------------------------
def leer_nodo(ruta: Path, tipo_esperado: str) -> Nodo:
    """Lee un .md y lo convierte en Nodo, validando los campos."""
    post = frontmatter.load(ruta)
    meta = post.metadata

    for campo in ("id", "titulo"):
        if not meta.get(campo):
            raise ErrorNodo(f"{ruta.name}: falta el campo '{campo}'")

    tipo = meta.get("tipo", tipo_esperado)
    if tipo != tipo_esperado:
        raise ErrorNodo(
            f"{ruta.name}: dice tipo '{tipo}' pero está en la carpeta de '{tipo_esperado}'"
        )

    # YAML convierte 2026-11-09 (sin comillas) en un objeto date: lo pasamos a texto
    fecha = meta.get("fecha") or ""
    if isinstance(fecha, date):
        fecha = fecha.isoformat()

    padres = meta.get("padres") or []
    if not isinstance(padres, list):
        raise ErrorNodo(f"{ruta.name}: 'padres' debe ser una lista")

    # Categoría desconocida: se ignora (y se asigna sola al construir el grafo)
    categoria = meta.get("categoria")
    categoria = categoria if categoria in CATEGORIAS else None
    origen = None
    if tipo == "fuente":
        origen = meta.get("origen")
        origen = origen if origen in ORIGENES else origen_de_url(meta.get("fuente_url"))

    return Nodo(
        id=str(meta["id"]),
        titulo=str(meta["titulo"]),
        tipo=tipo,
        fecha=str(fecha),
        contenido=post.content.strip(),
        fuente_url=meta.get("fuente_url") or None,
        padres=[str(p) for p in padres],
        categoria=categoria,
        origen=origen,
        ruta=ruta,
    )


def leer_nodos() -> list[Nodo]:
    """Lee todos los nodos de las tres carpetas. Falla si hay ids repetidos."""
    nodos: list[Nodo] = []
    vistos: dict[str, Path] = {}
    for tipo, carpeta in CARPETAS.items():
        if not carpeta.exists():
            continue
        for ruta in sorted(carpeta.glob("*.md")):
            nodo = leer_nodo(ruta, tipo)
            if nodo.id in vistos:
                raise ErrorNodo(
                    f"id repetido '{nodo.id}' en {ruta.name} y {vistos[nodo.id].name}"
                )
            vistos[nodo.id] = ruta
            nodos.append(nodo)
    return nodos


# --- Escritura -----------------------------------------------------------
def siguiente_id(tipo: str) -> str:
    """Siguiente id libre para un tipo: idea-001, idea-002, ...

    Mira los archivos existentes y toma el número más alto + 1. Así nunca
    reutiliza un id, aunque hayas borrado archivos intermedios.
    """
    patron = re.compile(rf"^{tipo}-(\d+)$")
    mayor = 0
    carpeta = CARPETAS[tipo]
    if carpeta.exists():
        for ruta in carpeta.glob("*.md"):
            coincide = patron.match(ruta.stem)
            if coincide:
                mayor = max(mayor, int(coincide.group(1)))
    return f"{tipo}-{mayor + 1:03d}"


def guardar_nodo(
    tipo: str,
    titulo: str,
    contenido: str,
    fuente_url: str | None = None,
    padres: list[str] | None = None,
    fecha: str | None = None,
    id_nodo: str | None = None,
    categoria: str | None = None,
    origen: str | None = None,
) -> Path:
    """Crea el archivo .md de un nodo nuevo y devuelve su ruta."""
    if tipo not in CARPETAS:
        raise ValueError(f"tipo inválido: {tipo} (usa uno de {TIPOS})")

    id_nodo = id_nodo or siguiente_id(tipo)
    carpeta = CARPETAS[tipo]
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / f"{id_nodo}.md"
    if ruta.exists():
        raise FileExistsError(f"ya existe {ruta}")

    post = frontmatter.Post(
        contenido.strip() + "\n",
        id=id_nodo,
        titulo=titulo.strip(),
        tipo=tipo,
        fecha=fecha or date.today().isoformat(),
        fuente_url=fuente_url,
        padres=padres or [],
    )
    # Campos opcionales: solo se escriben si vienen (y son válidos)
    if categoria in CATEGORIAS:
        post["categoria"] = categoria
    if origen in ORIGENES:
        post["origen"] = origen
    # sort_keys=False: respeta el orden de arriba; allow_unicode: tildes legibles
    texto = frontmatter.dumps(post, sort_keys=False, allow_unicode=True)
    ruta.write_text(texto + "\n", encoding="utf-8")
    return ruta
