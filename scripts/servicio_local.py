"""
Servicio local: procesa en TU computador los videos de YouTube que agregas desde la página.

¿Por qué? YouTube bloquea las transcripciones cuando las pide un servidor en la nube
(como los de GitHub Actions), pero no desde la conexión de tu casa.

Cómo funciona (cada 30 segundos):
    1. Actualiza una copia APARTE del repositorio (~/.local/share/segundo-cerebro/clon),
       así nunca toca tu carpeta de trabajo ni tus cambios sin guardar.
    2. Si hay videos en pendientes/videos/, los procesa con procesar_pendientes.py --videos:
       transcripción (desde tu conexión) → resumen con tu sesión de Claude Code.
    3. Sube la fuente nueva (git push). Eso dispara la GitHub Action, que reconstruye
       el grafo y publica la página.

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
INTERVALO = 30  # segundos entre revisiones


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


def actualizar_clon() -> None:
    """Deja la copia idéntica a GitHub. Es seguro: es una copia SOLO del servicio."""
    git("fetch", "--quiet", "origin")
    git("reset", "--hard", "--quiet", "origin/main")
    git("clean", "-fdq")


def subir_cambios() -> None:
    git("add", "-A", "fuentes", "pendientes")
    if subprocess.run(["git", "-C", str(CLON), "diff", "--cached", "--quiet"]).returncode == 0:
        return
    git("commit", "--quiet", "-m", "fuente: video procesado en el computador local")
    for intento in range(3):
        try:
            git("push", "--quiet", "origin", "HEAD:main")
            log("✔ Subido a GitHub: la Action reconstruirá el grafo.")
            return
        except subprocess.CalledProcessError:
            # Alguien más subió algo mientras tanto (la página o la Action): integrar y reintentar
            git("pull", "--rebase", "--quiet", "origin", "main")
    raise RuntimeError("no se pudo subir a GitHub después de 3 intentos")


def una_vuelta() -> None:
    actualizar_clon()
    videos = sorted((CLON / "pendientes" / "videos").glob("*.json"))
    if not videos:
        return
    log(f"▶ {len(videos)} video(s) en cola. Procesando...")
    # Se ejecuta el script de la copia (la versión más reciente subida a GitHub),
    # con la sesión de Claude Code de este computador (USAR_CLAUDE_CODE=1).
    subprocess.run([sys.executable, str(CLON / "scripts" / "procesar_pendientes.py"), "--videos"],
                   cwd=CLON, env={**os.environ, "USAR_CLAUDE_CODE": "1"}, check=False)
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
