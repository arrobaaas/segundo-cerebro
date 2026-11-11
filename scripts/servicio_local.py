"""
Servicio local: procesa en TU computador los videos de YouTube que agregas desde la página.

¿Por qué? YouTube bloquea las transcripciones cuando las pide un servidor en la nube
(como los de GitHub Actions), pero no desde la conexión de tu casa.

Cómo funciona (cada 30 segundos):
    1. Actualiza una copia APARTE del repositorio (~/.local/share/segundo-cerebro/clon),
       así nunca toca tu carpeta de trabajo ni tus cambios sin guardar.
    2. Si hay videos en pendientes/videos/, los procesa con procesar_pendientes.py --videos
       (el de TU carpeta: del clon solo se leen datos, nunca se ejecuta su código):
       transcripción (desde tu conexión) → resumen con tu sesión de Claude Code.
    3. Reconstruye el grafo aquí mismo (~10 s, el modelo ya está en caché) y sube todo
       junto: fuente, ideas y graph.json. GitHub Pages lo publica en ~1 min, sin esperar
       a la GitHub Action. Nunca descarta trabajo: si algo falla, lo reintenta.

Si el computador está apagado, los videos esperan en la cola hasta que lo enciendas.

Instalación como servicio (arranca solo al iniciar sesión):
    bash scripts/instalar_servicio.sh
Ver qué está haciendo:
    journalctl --user -u segundo-cerebro -f
Probarlo a mano (Ctrl+C para salir):
    .venv/bin/python scripts/servicio_local.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CLON = Path(os.environ.get("SEGUNDO_CEREBRO_CLON", "~/.local/share/segundo-cerebro/clon")).expanduser()
INTERVALO = 10  # segundos entre revisiones (un git fetch: es liviano)


def log(mensaje: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {mensaje}", flush=True)


def git(*args: str, repo: Path = CLON) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True)


def preparar_clon() -> None:
    """Clona el repositorio la primera vez (la copia aparte del servicio)."""
    if (CLON / ".git").exists():
        return
    url = git("config", "--get", "remote.origin.url", repo=RAIZ).stdout.strip()
    log(f"Clonando {url} en {CLON} ...")
    CLON.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "clone", "--quiet", url, str(CLON)], check=True)


def commits_sin_subir() -> int:
    return int(git("rev-list", "--count", "origin/main..HEAD").stdout.strip() or 0)


def actualizar_clon() -> None:
    """Deja la copia idéntica a GitHub. Es seguro: es una copia SOLO del servicio.
    Nunca descarta trabajo: si quedó algo sin subir (p. ej. sin internet), lo sube primero."""
    git("fetch", "--quiet", "origin")
    if commits_sin_subir():
        log("Hay trabajo sin subir de una vuelta anterior: subiéndolo...")
        subir_cambios()
        return
    git("reset", "--hard", "--quiet", "origin/main")
    git("clean", "-fdq")


def construir_grafo(entorno: dict) -> None:
    """Reconstruye graph.json AQUÍ (el modelo ya está en caché: ~10 s), así la página
    no tiene que esperar a la GitHub Action (~1-2 min)."""
    subprocess.run([sys.executable, str(RAIZ / "scripts" / "build_graph.py")],
                   cwd=RAIZ, env=entorno, check=True, capture_output=True, text=True)
    git("add", "web/graph.json")
    if subprocess.run(["git", "-C", str(CLON), "diff", "--cached", "--quiet"]).returncode != 0:
        git("commit", "--quiet", "-m", "grafo: reconstruido en el computador local")


def subir_cambios() -> None:
    """Sube el contenido nuevo + el grafo. Si GitHub cambió mientras tanto, integra
    el contenido (archivos nuevos: no chocan) y vuelve a construir el grafo encima."""
    entorno = {**os.environ, "SEGUNDO_CEREBRO_DATOS": str(CLON)}
    for intento in range(3):
        # El último commit puede ser el grafo de un intento anterior: se rehace encima de lo nuevo
        if git("log", "-1", "--format=%s").stdout.startswith("grafo: reconstruido en el computador"):
            git("reset", "--soft", "--quiet", "HEAD~1")
            git("restore", "--staged", "--worktree", "web/graph.json")
        git("fetch", "--quiet", "origin")
        git("rebase", "--quiet", "origin/main")  # si chocara, lanza error y se reintenta en otra vuelta
        construir_grafo(entorno)
        try:
            git("push", "--quiet", "origin", "HEAD:main")
            log("✔ Subido a GitHub con el grafo listo: la página lo publica en ~1 min.")
            return
        except subprocess.CalledProcessError:
            log("GitHub cambió mientras tanto: integrando y reintentando...")
    raise RuntimeError("no se pudo subir a GitHub después de 3 intentos (se reintentará)")


def guardar_contenido() -> bool:
    """Guarda en un commit propio todo lo que generó el procesamiento."""
    # Solo las carpetas que existen (o que Git conoce): si no, "git add" falla.
    # Por ejemplo, pendientes/ desaparece cuando se procesó el último pendiente.
    carpetas = [c for c in ("fuentes", "ideas", "pendientes")
                if (CLON / c).exists() or git("ls-files", "--", c).stdout.strip()]
    git("add", "-A", "--", *carpetas)
    if subprocess.run(["git", "-C", str(CLON), "diff", "--cached", "--quiet"]).returncode == 0:
        return False
    git("commit", "--quiet", "-m", "fuente: video procesado en el computador local")
    return True


def una_vuelta() -> None:
    actualizar_clon()
    videos = sorted((CLON / "pendientes" / "videos").glob("*.json"))
    if not videos:
        return
    log(f"▶ {len(videos)} video(s) en cola. Procesando...")
    # SEGURIDAD: se ejecuta el código de TU carpeta (RAIZ), nunca el del clon. Del clon
    # solo se leen datos (SEGUNDO_CEREBRO_DATOS). Así, aunque alguien subiera código
    # malicioso a GitHub (p. ej. con un token robado), tu computador no lo ejecutaría.
    entorno = {**os.environ, "USAR_CLAUDE_CODE": "1", "SEGUNDO_CEREBRO_DATOS": str(CLON)}
    subprocess.run([sys.executable, str(RAIZ / "scripts" / "procesar_pendientes.py"), "--videos"],
                   cwd=RAIZ, env=entorno, check=False)
    if guardar_contenido():
        subir_cambios()


def main() -> int:
    log(f"Servicio de videos iniciado. Revisando cada {INTERVALO} s (Ctrl+C para salir).")
    preparar_clon()
    while True:
        try:
            una_vuelta()
        except subprocess.CalledProcessError as e:
            log(f"✘ git falló: {(e.stderr or e.stdout or '').strip()[:300]}")
        except Exception as e:  # que un error pasajero (sin internet, etc.) no detenga el servicio
            log(f"✘ {type(e).__name__}: {e}")
        time.sleep(INTERVALO)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("Servicio detenido.")
