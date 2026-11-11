"""
Aprende de un link: extrae su contenido, lo resume con Claude enfocado en tu
carrera de Informática, lo guarda como nodo "fuente" y reconstruye el grafo.

Uso:
    python scripts/agregar_fuente.py https://www.youtube.com/watch?v=XXXXXXXXXXX
    python scripts/agregar_fuente.py https://un-blog.com/articulo
    python scripts/agregar_fuente.py <url> --manual        # GRATIS: usa tu cuenta de claude.ai
    python scripts/agregar_fuente.py <url> --sin-build     # no reconstruye el grafo
    python scripts/agregar_fuente.py <url> --forzar        # aunque ya exista esa URL

Cómo funciona:
    YouTube → transcripción (subtítulos) con youtube-transcript-api
    Web     → texto principal con trafilatura (descarta menús, anuncios, etc.)
    Luego   → Claude devuelve un JSON con título, resumen, aprendizajes,
              ideas de proyecto y tecnologías (structured outputs)

Modo --manual: en vez de la API (de pago), el script te entrega el prompt para
pegarlo en claude.ai y tú le devuelves la respuesta. Mismo resultado, sin costo.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

from pydantic import BaseModel, Field, ValidationError

from typing import Literal

from cerebro import CATEGORIAS, RAIZ, guardar_nodo, leer_nodos, leer_perfil
from claude_cliente import ErrorClaude, pedir_estructurado, salir_con_error
from manual import entregar_prompt, extraer_json, recibir_respuesta

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

    # YouTube suele bloquear a los servidores en la nube (como los de GitHub Actions).
    # Si pasa, se puede usar un proxy poniendo su dirección en YOUTUBE_PROXY
    # (ej. http://usuario:clave@proxy:puerto). Sin esa variable, conexión directa.
    proxy = os.environ.get("YOUTUBE_PROXY", "").strip()
    if proxy:
        from youtube_transcript_api.proxies import GenericProxyConfig
        api = YouTubeTranscriptApi(proxy_config=GenericProxyConfig(http_url=proxy, https_url=proxy))
    else:
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
    tecnologias: list[str] = Field(description="3 a 6 tecnologías concretas para construirla")
    # Cada idea tiene su propio tema: puede caer en otra galaxia que su fuente
    categoria: Literal[tuple(CATEGORIAS)] = Field(description=(
        "tema principal de ESTA idea. Opciones: "
        + "; ".join(f"{clave} = {nombre}" for clave, (nombre, _) in CATEGORIAS.items())))


class ResumenFuente(BaseModel):
    titulo: str = Field(description="título corto en español que describa la fuente")
    resumen: str = Field(description="3 a 5 oraciones: de qué trata y por qué le sirve a su carrera")
    aprendizajes: list[str] = Field(description="3 a 5 aprendizajes concretos y técnicos")
    ideas_proyecto: list[IdeaProyecto] = Field(description=(
        "2 o 3 ideas de proyecto viables inspiradas en la fuente. Cada una se guarda como un "
        "nodo propio del grafo: que sean concretas, distintas entre sí y útiles para el portafolio"))
    tecnologias: list[str] = Field(description="tecnologías, herramientas o conceptos clave mencionados")
    # Literal = la API solo acepta una de estas claves (structured outputs)
    categoria: Literal[tuple(CATEGORIAS)] = Field(description=(
        "tema principal de la fuente, para agruparla en el grafo. Opciones: "
        + "; ".join(f"{clave} = {nombre}" for clave, (nombre, _) in CATEGORIAS.items())))


SYSTEM_RESUMEN = """Eres un mentor de carrera para un estudiante de Ingeniería en Informática.
Tu trabajo es leer una fuente (transcripción de un video, un artículo o un PDF) y extraer lo que le
sirve para su desarrollo profesional y para construir proyectos reales.

Perfil del estudiante:
{perfil}

Instrucciones:
- Escribe todo en español, claro y directo, aunque la fuente esté en otro idioma.
- El resumen va primero y debe capturar la esencia: se usa para conectar esta fuente con
  otras ideas del estudiante, así que menciona los temas técnicos principales.
- Las ideas de proyecto deben ser VIABLES para un estudiante: alcanzables con su nivel
  (estudiante de 4.º año), útiles para su portafolio, y conectadas con lo que enseña la fuente.
- Las ideas deben ser ORIGINALES: un problema concreto con un enfoque propio, no un clon de un
  producto conocido ni una idea genérica ("una app de tareas", "un chatbot", "un clon de X").
  Cada idea debe tener algo que la distinga: un usuario específico, un dato poco usado, una
  combinación de áreas inesperada o un giro técnico interesante.
- Las 2 o 3 ideas deben ser distintas entre sí (otro problema, otro enfoque o otra área), y
  NUEVAS respecto de las ideas que el estudiante ya tiene (se listan junto a la fuente): no
  repitas ni reformules ninguna de esas.
- Si la fuente no trata de informática, busca la conexión más razonable con su carrera
  (ej. un tema de finanzas → una herramienta de software para ese tema)."""


def ideas_existentes() -> str:
    """Títulos de las ideas que ya están en el grafo, para que Claude no las repita."""
    titulos = sorted(n.titulo for n in leer_nodos() if n.tipo in ("idea", "fusionada"))
    if not titulos:
        return ""
    lista = "\n".join(f"- {t}" for t in titulos[-80:])  # tope: no alargar demasiado el mensaje
    return f"\n\n<ideas_que_ya_tengo>\n{lista}\n</ideas_que_ya_tengo>"


def mensaje_fuente(texto: str, url: str, titulo_original: str | None, es_video: bool) -> str:
    tipo = "Transcripción de un video de YouTube" if es_video else "Artículo web"
    return (
        f"{tipo}\nURL: {url}\n"
        + (f"Título original: {titulo_original}\n" if titulo_original else "")
        + f"\n<fuente>\n{texto}\n</fuente>"
        + ideas_existentes()
    )


def resumir(texto: str, url: str, titulo_original: str | None, es_video: bool) -> ResumenFuente:
    """Modo API: la API garantiza el formato con structured outputs."""
    mensaje = mensaje_fuente(texto, url, titulo_original, es_video)
    return pedir_estructurado(SYSTEM_RESUMEN.format(perfil=leer_perfil()), mensaje, ResumenFuente)


# En claude.ai no podemos forzar el formato como con la API: se lo pedimos
# con un ejemplo explícito y después lo validamos con Pydantic.
FORMATO_MANUAL = """Responde ÚNICAMENTE con un JSON dentro de un bloque ```json, sin texto antes ni
después, con exactamente esta forma:

```json
{
  "titulo": "título corto en español que describa la fuente",
  "resumen": "3 a 5 oraciones: de qué trata y por qué me sirve en mi carrera",
  "aprendizajes": ["aprendizaje técnico concreto", "..."],
  "ideas_proyecto": [
    {"nombre": "nombre corto", "descripcion": "qué hace y qué problema resuelve", "mvp": "versión mínima construible en pocas semanas",
     "tecnologias": ["tecnología concreta", "..."], "categoria": "web | ia | datos | ciberseguridad | juegos | movil | nube | automatizacion | carrera | otros"}
  ],
  "tecnologias": ["tecnología o concepto clave", "..."],
  "categoria": "una de: web, ia, datos, ciberseguridad, juegos, movil, nube, automatizacion, carrera, otros"
}
```

Incluye 3 a 5 aprendizajes y 2 o 3 ideas de proyecto."""


def resumir_manual(texto: str, url: str, titulo_original: str | None, es_video: bool) -> ResumenFuente:
    """Modo manual: el usuario lleva el prompt a claude.ai y trae la respuesta."""
    prompt = (
        SYSTEM_RESUMEN.format(perfil=leer_perfil())
        + "\n\n" + mensaje_fuente(texto, url, titulo_original, es_video)
        + "\n\n" + FORMATO_MANUAL
    )
    entregar_prompt(prompt, "prompt_fuente.txt")

    for intento in range(3):  # si se pega mal, damos otra oportunidad
        respuesta = recibir_respuesta("el bloque JSON de la respuesta")
        try:
            return ResumenFuente.model_validate(extraer_json(respuesta))
        except (ValueError, ValidationError) as e:
            detalle = e.errors()[0]["msg"] if isinstance(e, ValidationError) else str(e)
            print(f"✘ No pude leer la respuesta: {detalle}")
            if intento < 2:
                print("  Vuelve a copiar la respuesta completa de Claude e inténtalo de nuevo.")
    raise ErrorClaude("No se recibió una respuesta válida después de 3 intentos.")


# Si una fuente maliciosa lograra que Claude escribiera una clave en el resumen, este
# filtro impide guardarla (el repositorio es público). Mismos patrones que .githooks/pre-commit.
PATRON_SECRETO = re.compile(
    r"sk-ant-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}"
    r"|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|AIza[0-9A-Za-z_-]{35}")


def revisar_secretos(r: ResumenFuente) -> None:
    if PATRON_SECRETO.search(r.model_dump_json()):
        raise ErrorExtraccion("El resumen contiene algo que parece una clave secreta; "
                              "por seguridad no se guardó.")


def armar_contenido(r: ResumenFuente) -> str:
    """Texto del nodo. El resumen va primero: el modelo de embeddings solo lee
    los primeros ~128 tokens, así que lo más representativo debe ir al inicio."""
    partes = [r.resumen.strip(), "Aprendizajes clave:\n" + "\n".join(f"• {a}" for a in r.aprendizajes)]
    if r.ideas_proyecto:
        # El detalle (MVP, tecnologías) vive en el nodo propio de cada idea
        ideas = "\n".join(f"• {i.nombre}: {i.descripcion}" for i in r.ideas_proyecto)
        partes.append("Ideas de proyecto que inspira (cada una es una estrella propia):\n" + ideas)
    if r.tecnologias:
        partes.append("Tecnologías: " + ", ".join(r.tecnologias))
    return "\n\n".join(partes)


def contenido_idea(idea: IdeaProyecto, titulo_fuente: str) -> str:
    partes = [idea.descripcion.strip(), f"MVP: {idea.mvp.strip()}"]
    if idea.tecnologias:
        partes.append("Tecnologías: " + ", ".join(idea.tecnologias))
    partes.append(f"Nació de la fuente: {titulo_fuente}")
    return "\n\n".join(partes)


def crear_ideas(r: ResumenFuente, id_fuente: str) -> list[str]:
    """Crea un nodo "idea" por cada idea de proyecto, enlazado a su fuente (padre)."""
    ids = []
    for idea in r.ideas_proyecto:
        ruta = guardar_nodo("idea", idea.nombre, contenido_idea(idea, r.titulo),
                            padres=[id_fuente], categoria=idea.categoria)
        ids.append(ruta.stem)
        print(f"  💡 {ruta.stem}: {idea.nombre}")
    return ids


# --- PDF (lo usa procesar_pendientes.py) -------------------------------------

# Límite de la API: 32 MB por solicitud (el PDF va en base64, que pesa ~33% más)
MAX_BYTES_PDF = 20 * 1024 * 1024


def agregar_pdf(pdf: bytes, nombre: str, url: str | None = None) -> int:
    """Resume un PDF con Claude (lo lee completo, incluidas imágenes y tablas)
    y lo guarda como nodo fuente. Devuelve 0 si salió bien."""
    import base64

    if not pdf.startswith(b"%PDF"):
        return salir_con_error(ErrorExtraccion("El archivo no es un PDF válido."))
    if len(pdf) > MAX_BYTES_PDF:
        return salir_con_error(ErrorExtraccion(
            f"El PDF pesa {len(pdf) / 1e6:.1f} MB (máximo {MAX_BYTES_PDF / 1e6:.0f} MB)."))

    print(f"📄 PDF «{nombre}» ({len(pdf) / 1e6:.1f} MB)")
    print("🧠 Claude está leyendo y resumiendo el PDF...")
    mensaje = [
        {"type": "document", "source": {"type": "base64", "media_type": "application/pdf",
                                        "data": base64.standard_b64encode(pdf).decode()}},
        {"type": "text", "text": f"Documento PDF\nNombre del archivo: {nombre}\n"
                                 + (f"URL: {url}\n" if url else "")
                                 + "Resume este documento según las instrucciones."
                                 + ideas_existentes()},
    ]
    try:
        r = pedir_estructurado(SYSTEM_RESUMEN.format(perfil=leer_perfil()), mensaje, ResumenFuente)
        revisar_secretos(r)
    except (ErrorClaude, ErrorExtraccion) as e:
        return salir_con_error(e)
    ruta = guardar_nodo("fuente", r.titulo, armar_contenido(r), fuente_url=url,
                        categoria=r.categoria, origen="pdf")
    print(f"✔ Fuente creada: {ruta.relative_to(RAIZ)} — {r.titulo}")
    crear_ideas(r, ruta.stem)
    return 0


# --- Programa principal ----------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Agrega una fuente (YouTube o web) al grafo.")
    parser.add_argument("url", help="link de YouTube o de una página web")
    parser.add_argument("--manual", action="store_true",
                        help="gratis: copiar el prompt a claude.ai en vez de usar la API")
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
                  "Usa --forzar para agregarla igual.", file=sys.stderr)
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

    # 2) Resumir con Claude (por la API, o a mano en claude.ai)
    try:
        if args.manual:
            r = resumir_manual(texto, url, titulo_original, bool(video_id))
        else:
            print("🧠 Claude está resumiendo la fuente...")
            r = resumir(texto, url, titulo_original, bool(video_id))
    except ErrorClaude as e:
        return salir_con_error(e)

    # 3) Guardar el nodo
    try:
        revisar_secretos(r)
    except ErrorExtraccion as e:
        return salir_con_error(e)
    ruta = guardar_nodo("fuente", r.titulo, armar_contenido(r), fuente_url=url,
                        categoria=r.categoria, origen="video" if video_id else "web")
    print(f"✔ Fuente creada: {ruta.relative_to(RAIZ)} — {r.titulo}")
    crear_ideas(r, ruta.stem)

    if args.sin_build:
        return 0
    import build_graph
    return build_graph.main([])


if __name__ == "__main__":
    sys.exit(main())
