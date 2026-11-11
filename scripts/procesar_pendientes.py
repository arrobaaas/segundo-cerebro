"""
Procesa los links que dejó la página web en pendientes/ (lo ejecuta la GitHub Action).

Flujo automático (sin copiar prompts):
    1. En la página pegas un link y aprietas "Agregar al cerebro".
    2. La página guarda pendientes/<id>.json con {"url": ...} en el repositorio.
    3. La GitHub Action corre este script: por cada pendiente usa agregar_fuente.py
       (transcripción de YouTube o texto de la web → resumen con la API de Claude →
       fuentes/fuente-XXX.md) y borra el pendiente.
    4. Si algo falla, deja pendientes/fallidos/<id>.json con el error, para que la
       página te lo muestre.
    5. Luego la Action reconstruye graph.json y aparecen las estrellas nuevas.
       Si salió bien, deja pendientes/listos/<id>.json con los ids creados.

PDF: la página sube pendientes/<id>.bin con el PDF CIFRADO en el navegador
(RSA-OAEP + AES-256-GCM). El repo es público, pero sin la clave privada (el secreto
PDF_PRIVATE_KEY de GitHub) nadie puede leerlo. Formato del .bin:
    [384 bytes: clave AES cifrada con RSA-3072] [12 bytes: IV] [PDF cifrado + etiqueta GCM]

Claude se conecta con el secreto CLAUDE_CODE_OAUTH_TOKEN (tu suscripción) o ANTHROPIC_API_KEY
(API de pago), guardados en GitHub: nunca están en la página.

VIDEOS DE YOUTUBE: YouTube bloquea a los servidores de GitHub, así que la página
los deja en pendientes/videos/ (la Action no los toca) y los procesa tu computador
con scripts/servicio_local.py, que llama a este script con --videos.

Uso local (opcional, con tu .env):
    python scripts/procesar_pendientes.py            # links y PDFs
    python scripts/procesar_pendientes.py --videos   # videos de YouTube
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import re
import sys
from datetime import date

from cerebro import RAIZ, leer_nodos

import agregar_fuente

PENDIENTES = RAIZ / "pendientes"
VIDEOS = PENDIENTES / "videos"
FALLIDOS = PENDIENTES / "fallidos"
LISTOS = PENDIENTES / "listos"

# Topes de uso: aunque alguien llenara la cola (p. ej. con un token robado), no podría
# agotar tu plan de Claude.
MAX_POR_EJECUCION = 10
LIMITE_DIARIO = 20  # fuentes nuevas por día, contando todas las vías


def leer_pendiente(archivo) -> dict:
    try:
        datos = json.loads(archivo.read_text(encoding="utf-8"))
        return datos if isinstance(datos, dict) else {}
    except (ValueError, OSError):
        return {}


def descifrar_pdf(cifrado: bytes) -> bytes:
    """Descifra un PDF subido desde la página (ver formato arriba)."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    pem = os.environ.get("PDF_PRIVATE_KEY", "").strip()
    if not pem:
        raise ValueError("Falta el secreto PDF_PRIVATE_KEY en GitHub para leer PDFs.")
    privada = serialization.load_pem_private_key(pem.encode(), password=None)
    clave_aes = privada.decrypt(cifrado[:384], padding.OAEP(
        mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    return AESGCM(clave_aes).decrypt(cifrado[384:396], cifrado[396:], None)


def procesar(datos: dict, archivo) -> str | None:
    """Agrega la fuente. Devuelve None si salió bien, o el mensaje de error."""
    url = str(datos.get("url") or "").strip()
    es_pdf = datos.get("tipo") == "pdf"
    if url and not re.fullmatch(r"https?://\S{1,2000}", url):
        return "El link no es válido (debe empezar con http:// o https://)."
    if not es_pdf and not url:
        return "Falta el link."

    errores = io.StringIO()
    with contextlib.redirect_stderr(errores):
        try:
            if es_pdf:
                binario = archivo.with_suffix(".bin")
                if not binario.exists():
                    raise ValueError("No llegó el archivo PDF.")
                try:
                    pdf = descifrar_pdf(binario.read_bytes())
                except ValueError:
                    raise
                except Exception:
                    raise ValueError("No se pudo descifrar el PDF (¿cambió la clave?).") from None
                nombre = re.sub(r"[^\w .()-]", "", str(datos.get("nombre") or "documento.pdf"))[:120]
                codigo = agregar_fuente.agregar_pdf(pdf, nombre, url or None)
            else:
                codigo = agregar_fuente.main([url, "--sin-build"])
        except ValueError as e:
            print(f"✘ {e}", file=sys.stderr)
            codigo = 1
        except Exception as e:  # que un archivo malo no detenga a los demás
            print(f"✘ Error inesperado: {type(e).__name__}", file=sys.stderr)
            codigo = 1
    salida = errores.getvalue()
    sys.stderr.write(salida)  # que quede también en el registro de la Action
    if codigo == 0:
        return None
    lineas = [l.strip().removeprefix("✘").strip() for l in salida.splitlines() if l.strip()]
    return (" ".join(lineas) or "No se pudo procesar el link.")[:500]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Procesa lo que dejó la página en pendientes/.")
    parser.add_argument("--videos", action="store_true",
                        help="procesar los videos de YouTube (pendientes/videos/), en tu computador")
    args = parser.parse_args(argv)

    carpeta = VIDEOS if args.videos else PENDIENTES
    archivos = sorted(carpeta.glob("*.json"))
    if not archivos:
        print("No hay pendientes.")
        return 0

    sin_key = (not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
               and os.environ.get("USAR_CLAUDE_CODE") != "1" and not (RAIZ / ".env").exists())
    for archivo in archivos[:MAX_POR_EJECUCION]:
        datos = leer_pendiente(archivo)
        url = str(datos.get("url") or "")
        print(f"\n=== {archivo.name}: {datos.get('tipo', 'link')} {url}")
        # En GitHub, YouTube bloquea las transcripciones: el video pasa a la cola de
        # tu computador (por si llegó aquí desde una versión antigua de la página)
        if not args.videos and os.environ.get("GITHUB_ACTIONS") and agregar_fuente.id_youtube(url):
            VIDEOS.mkdir(parents=True, exist_ok=True)
            archivo.rename(VIDEOS / archivo.name)
            print("▶ Video de YouTube: queda en pendientes/videos/ para tu computador.")
            continue
        antes = {n.id for n in leer_nodos()}
        hoy = date.today().isoformat()
        if sum(1 for n in leer_nodos() if n.tipo == "fuente" and n.fecha == hoy) >= LIMITE_DIARIO:
            error = (f"Se alcanzó el límite de {LIMITE_DIARIO} fuentes por día (protege tu plan "
                     "de Claude). Inténtalo mañana.")
        elif sin_key:
            error = ("Falta conectar Claude: agrega en GitHub el secreto CLAUDE_CODE_OAUTH_TOKEN "
                     "(tu suscripción, con `claude setup-token`) o ANTHROPIC_API_KEY (API de pago).")
        else:
            error = procesar(datos, archivo)
        if error:
            FALLIDOS.mkdir(parents=True, exist_ok=True)
            (FALLIDOS / archivo.name).write_text(
                json.dumps({"url": url, "error": error}, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"✘ Falló: {error}")
        else:
            # Para que la página sepa qué estrella nueva buscar en el grafo
            nuevos = sorted({n.id for n in leer_nodos()} - antes)
            LISTOS.mkdir(parents=True, exist_ok=True)
            (LISTOS / archivo.name).write_text(json.dumps({"ids": nuevos}) + "\n", encoding="utf-8")
            print(f"✔ Listo: {', '.join(nuevos)}")
        archivo.unlink()
        archivo.with_suffix(".bin").unlink(missing_ok=True)

    if len(archivos) > MAX_POR_EJECUCION:
        print(f"\nQuedan {len(archivos) - MAX_POR_EJECUCION} pendientes para la próxima ejecución.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
