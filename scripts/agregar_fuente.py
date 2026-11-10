"""
Aprende de un link: extrae su contenido, lo resume con Claude enfocado en tu
carrera de Informática, lo guarda como nodo "fuente" y reconstruye el grafo.

Uso:
    python scripts/agregar_fuente.py https://www.youtube.com/watch?v=XXXXXXXXXXX
    python scripts/agregar_fuente.py https://un-blog.com/articulo
    python scripts/agregar_fuente.py <url> --sin-build     # no reconstruye el grafo
    python scripts/agregar_fuente.py <url> --forzar        # aunque ya exista esa URL

Cómo funciona:
    YouTube → transcripción (subtítulos) con youtube-transcript-api
    Web     → texto principal con trafilatura (descarta menús, anuncios, etc.)
    Luego   → Claude devuelve un JSON con título, resumen, aprendizajes,
              ideas de proyecto y tecnologías (structured outputs)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request

from pydantic import BaseModel, Field

from cerebro import RAIZ, guardar_nodo, leer_nodos, leer_perfil
from claude_cliente import ErrorClaude, pedir_estructurado, salir_con_error

# Claude acepta textos enormes (1M tokens), pero un tope evita gastar de más
# por error (ej. un link a un libro completo). ~400.000 caracteres ≈ 100.000 tokens.
MAX_CARACTERES = 400_000


class ErrorExtraccion(Exception):
    """No se pudo obtener el texto del link."""


# --- Extracción: YouTube ----------------------------------------------------

def id_youtube(url: str) -> str | None:
    """Saca el id de 11 caracteres de cualquier formato de link de YouTube."""
    p = urllib.parse.urlparse(url)
    host = p.netloc.lower().removeprefix("www.").removeprefix("m.")
    if host == "youtu.be":
        candidato = p.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com"):
        if p.path == "/watch":
            candidato = urllib.parse.parse_qs(p.query).get("v", [""])[0]
        else:
            # /shorts/ID, /embed/ID, /live/ID
            partes = p.path.strip("/").split("/")
            candidato = partes[1] if len(partes) >= 2 and partes[0] in ("shorts", "embed", "live") else ""
    else:
        return None
    return candidato if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidato or "") else None


def titulo_youtube(url: str) -> str | None:
    """Título del video usando oEmbed (un servicio público de YouTube, sin key)."""
    consulta = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(url, safe="")
    try:
        with urllib.request.urlopen(consulta, timeout=10) as r:
            return json.load(r).get("title")
    except Exception:
        return None  # el título es opcional: si falla, Claude inventa uno


def extraer_youtube(video_id: str) -> str:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api import (CouldNotRetrieveTranscript, IpBlocked,
                                        RequestBlocked, TranscriptsDisabled)

    api = YouTubeTranscriptApi()
    try:
        # Preferimos subtítulos en español y luego en inglés...
        transcripcion = api.fetch(video_id, languages=["es", "es-419", "es-ES", "en"])
    except TranscriptsDisabled:
        raise ErrorExtraccion("Este video tiene los subtítulos desactivados.") from None
    except (IpBlocked, RequestBlocked):
        raise ErrorExtraccion("YouTube está bloqueando las solicitudes desde tu red. "
                              "Intenta más tarde o desde otra conexión.") from None
    except CouldNotRetrieveTranscript:
        # ...y si no hay, tomamos el primero disponible (cualquier idioma:
        # Claude lo entiende igual y el resumen lo escribe en español)
        try:
            disponibles = list(api.list(video_id))
            if not disponibles:
                raise ErrorExtraccion("El video no tiene subtítulos.")
            transcripcion = disponibles[0].fetch()
        except CouldNotRetrieveTranscript as e:
            raise ErrorExtraccion(f"No se pudo obtener la transcripción: {type(e).__name__}") from None

    return " ".join(fragmento.text for fragmento in transcripcion).strip()


# --- Extracción: página web ------------------------------------------------

def extraer_web(url: str) -> tuple[str | None, str]:
    """Devuelve (título, texto principal) de una página web."""
    import trafilatura

    html = trafilatura.fetch_url(url)
    if not html:
        raise ErrorExtraccion("No se pudo descargar la página (¿link roto o sitio que bloquea bots?).")
    texto = trafilatura.extract(html, include_comments=False, include_tables=True)
    if not texto or len(texto) < 200:
        raise ErrorExtraccion("La página casi no tiene texto legible. Puede que se cargue con "
                              "JavaScript o requiera iniciar sesión.")
    meta = trafilatura.extract_metadata(html)
    return (meta.title if meta else None), texto


# --- Resumen con Claude ----------------------------------------------------

class IdeaProyecto(BaseModel):
    nombre: str = Field(description="nombre corto del proyecto")
    descripcion: str = Field(description="qué hace y qué problema resuelve, 1-2 oraciones")
    mvp: str = Field(description="la versión mínima que se puede construir en pocas semanas")


class ResumenFuente(BaseModel):
    titulo: str = Field(description="título corto en español que describa la fuente")
    resumen: str = Field(description="3 a 5 oraciones: de qué trata y por qué le sirve a su carrera")
    aprendizajes: list[str] = Field(description="3 a 5 aprendizajes concretos y técnicos")
    ideas_proyecto: list[IdeaProyecto] = Field(description="2 o 3 ideas de proyecto viables inspiradas en la fuente")
    tecnologias: list[str] = Field(description="tecnologías, herramientas o conceptos clave mencionados")


SYSTEM_RESUMEN = """Eres un mentor de carrera para un estudiante de Ingeniería en Informática.
Tu trabajo es leer una fuente (transcripción de un video o un artículo) y extraer lo que le
sirve para su desarrollo profesional y para construir proyectos reales.

Perfil del estudiante:
{perfil}

Instrucciones:
- Escribe todo en español, claro y directo, aunque la fuente esté en otro idioma.
- El resumen va primero y debe capturar la esencia: se usa para conectar esta fuente con
  otras ideas del estudiante, así que menciona los temas técnicos principales.
- Las ideas de proyecto deben ser VIABLES para un estudiante: alcanzables con su nivel y
  tiempo, útiles para su portafolio, y conectadas con lo que enseña la fuente. Evita ideas
  genéricas ("una app de tareas") salvo que tengan un giro concreto.
- Si la fuente no trata de informática, busca la conexión más razonable con su carrera
  (ej. un tema de finanzas → una herramienta de software para ese tema)."""


def resumir(texto: str, url: str, titulo_original: str | None, es_video: bool) -> ResumenFuente:
    tipo = "Transcripción de un video de YouTube" if es_video else "Artículo web"
    mensaje = (
        f"{tipo}\nURL: {url}\n"
        + (f"Título original: {titulo_original}\n" if titulo_original else "")
        + f"\n<fuente>\n{texto}\n</fuente>"
    )
    return pedir_estructurado(SYSTEM_RESUMEN.format(perfil=leer_perfil()), mensaje, ResumenFuente)


def armar_contenido(r: ResumenFuente) -> str:
    """Texto del nodo. El resumen va primero: el modelo de embeddings solo lee
    los primeros ~128 tokens, así que lo más representativo debe ir al inicio."""
    partes = [r.resumen.strip(), "Aprendizajes clave:\n" + "\n".join(f"• {a}" for a in r.aprendizajes)]
    if r.ideas_proyecto:
        ideas = "\n".join(f"• {i.nombre}: {i.descripcion} MVP: {i.mvp}" for i in r.ideas_proyecto)
        partes.append("Ideas de proyecto que inspira:\n" + ideas)
    if r.tecnologias:
        partes.append("Tecnologías: " + ", ".join(r.tecnologias))
    return "\n\n".join(partes)


# --- Programa principal ----------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Agrega una fuente (YouTube o web) al grafo.")
    parser.add_argument("url", help="link de YouTube o de una página web")
    parser.add_argument("--sin-build", action="store_true", help="no reconstruir graph.json")
    parser.add_argument("--forzar", action="store_true", help="agregarla aunque esa URL ya exista")
    args = parser.parse_args(argv)

    url = args.url.strip()
    if not re.match(r"^https?://", url):
        parser.error("la URL debe empezar con http:// o https://")

    # ¿Ya la habíamos agregado? (evita gastar en Claude dos veces)
    if not args.forzar:
        repetida = next((n for n in leer_nodos() if n.fuente_url == url), None)
        if repetida:
            print(f"Esa URL ya está en el grafo como {repetida.id} ({repetida.titulo}). "
                  "Usa --forzar para agregarla igual.")
            return 1

    # 1) Extraer
    video_id = id_youtube(url)
    try:
        if video_id:
            print(f"▶ Video de YouTube ({video_id}): obteniendo transcripción...")
            titulo_original = titulo_youtube(url)
            texto = extraer_youtube(video_id)
        else:
            print("🌐 Página web: extrayendo el texto principal...")
            titulo_original, texto = extraer_web(url)
    except ErrorExtraccion as e:
        return salir_con_error(e)

    print(f"  {len(texto):,} caracteres extraídos" + (f" · «{titulo_original}»" if titulo_original else ""))
    if len(texto) > MAX_CARACTERES:
        return salir_con_error(ErrorExtraccion(
            f"El texto es muy largo ({len(texto):,} caracteres, máximo {MAX_CARACTERES:,}). "
            "Prueba con una fuente más corta."))

    # 2) Resumir con Claude
    print("🧠 Claude está resumiendo la fuente...")
    try:
        r = resumir(texto, url, titulo_original, bool(video_id))
    except ErrorClaude as e:
        return salir_con_error(e)

    # 3) Guardar el nodo
    ruta = guardar_nodo("fuente", r.titulo, armar_contenido(r), fuente_url=url)
    print(f"✔ Fuente creada: {ruta.relative_to(RAIZ)} — {r.titulo}")
    for idea in r.ideas_proyecto:
        print(f"  💡 {idea.nombre}")

    if args.sin_build:
        return 0
    import build_graph
    return build_graph.main([])


if __name__ == "__main__":
    sys.exit(main())
