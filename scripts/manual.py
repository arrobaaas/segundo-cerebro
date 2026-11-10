"""
Modo manual (gratis): usar Claude a través de tu cuenta de claude.ai en vez de la API.

El script arma el prompt, tú lo pegas en claude.ai, y le devuelves la respuesta
al script. Este módulo tiene las piezas para ese "ida y vuelta":

- entregar_prompt(): copia el prompt al portapapeles (si hay xclip/xsel/wl-copy)
  y además lo guarda en .cache/ para poder arrastrarlo a claude.ai como archivo.
- recibir_respuesta(): lee la respuesta desde el portapapeles o pegada en la terminal.
- extraer_json(): saca el JSON de la respuesta aunque venga dentro de ```json ... ```.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from cerebro import RAIZ

CACHE = RAIZ / ".cache"  # está en .gitignore

# Programas de portapapeles en Linux: (copiar, pegar)
HERRAMIENTAS = [
    (["wl-copy"], ["wl-paste", "--no-newline"]),                 # Wayland
    (["xclip", "-selection", "clipboard"], ["xclip", "-selection", "clipboard", "-o"]),  # X11
    (["xsel", "--clipboard", "--input"], ["xsel", "--clipboard", "--output"]),           # X11
]


def _herramienta():
    for copiar, pegar in HERRAMIENTAS:
        if shutil.which(copiar[0]):
            return copiar, pegar
    return None


def copiar_al_portapapeles(texto: str) -> bool:
    h = _herramienta()
    if not h:
        return False
    try:
        # xclip se queda "vivo" sirviendo el portapapeles: no esperamos a que termine
        proceso = subprocess.Popen(h[0], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL)
        proceso.communicate(texto.encode("utf-8"), timeout=5)
        return True
    except (OSError, subprocess.TimeoutExpired):
        return False


def leer_portapapeles() -> str | None:
    h = _herramienta()
    if not h:
        return None
    try:
        return subprocess.run(h[1], capture_output=True, timeout=5).stdout.decode("utf-8")
    except (OSError, subprocess.TimeoutExpired):
        return None


def entregar_prompt(prompt: str, nombre_archivo: str) -> None:
    """Deja el prompt listo para usarlo en claude.ai."""
    CACHE.mkdir(exist_ok=True)
    archivo = CACHE / nombre_archivo
    archivo.write_text(prompt, encoding="utf-8")

    print("\n" + "─" * 64)
    if copiar_al_portapapeles(prompt):
        print("📋 El prompt quedó COPIADO. Ábrelo en https://claude.ai/new y pégalo (Ctrl+V).")
    else:
        print("📄 Abre https://claude.ai/new y ARRASTRA este archivo al chat (o copia su contenido):")
        print(f"     {archivo}")
        print("   Tip: instala xclip (sudo apt install xclip) y el prompt se copiará solo.")
    print(f"   ({len(prompt):,} caracteres. Revísalo antes de enviarlo: es lo que verá Claude.)")
    print("─" * 64)


def recibir_respuesta(que_copiar: str) -> str:
    """Pide la respuesta de Claude: desde el portapapeles o pegada en la terminal."""
    if _herramienta():
        input(f"\nCuando Claude termine, copia {que_copiar} (botón «Copy» bajo la respuesta)\n"
              "y presiona Enter aquí... ")
        texto = leer_portapapeles() or ""
        if texto.strip():
            return texto
        print("El portapapeles está vacío. Pégalo aquí entonces.")

    print(f"\nPega aquí {que_copiar}. Al terminar, presiona Enter y luego Ctrl+D:")
    return sys.stdin.read()


def extraer_json(texto: str) -> dict:
    """Saca el objeto JSON de la respuesta (Claude a veces lo envuelve en ```json)."""
    inicio, fin = texto.find("{"), texto.rfind("}")
    if inicio == -1 or fin <= inicio:
        raise ValueError("no encontré un JSON (algo entre { y }) en lo que pegaste")
    try:
        return json.loads(texto[inicio:fin + 1])
    except json.JSONDecodeError as e:
        raise ValueError(f"el JSON está incompleto o mal formado ({e.msg}, línea {e.lineno}). "
                         "¿Se copió la respuesta completa?") from None
