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

    return Nodo(
        id=str(meta["id"]),
        titulo=str(meta["titulo"]),
        tipo=tipo,
        fecha=str(fecha),
        contenido=post.content.strip(),
        fuente_url=meta.get("fuente_url") or None,
        padres=[str(p) for p in padres],
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
    # sort_keys=False: respeta el orden de arriba; allow_unicode: tildes legibles
    texto = frontmatter.dumps(post, sort_keys=False, allow_unicode=True)
    ruta.write_text(texto + "\n", encoding="utf-8")
    return ruta
