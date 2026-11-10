"""
Crea una idea nueva (archivo .md en ideas/) y reconstruye el grafo.

Uso:
    python scripts/agregar_idea.py "Título de la idea" -c "Contenido de la idea"
    python scripts/agregar_idea.py "Título de la idea"      # te pide el contenido
    python scripts/agregar_idea.py                          # te pide todo
    python scripts/agregar_idea.py "Título" -c "..." --sin-build   # no reconstruye
"""

from __future__ import annotations

import argparse
import sys

from cerebro import RAIZ, guardar_nodo


def pedir_contenido() -> str:
    """Lee un texto de varias líneas desde la terminal hasta Ctrl+D."""
    print("Escribe el contenido (varias líneas). Termina con una línea vacía y Ctrl+D:")
    return sys.stdin.read()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Crea una idea nueva en ideas/.")
    parser.add_argument("titulo", nargs="?", help="título de la idea")
    parser.add_argument("-c", "--contenido", help="contenido de la idea")
    parser.add_argument("--sin-build", action="store_true",
                        help="no reconstruir graph.json después de crear la idea")
    args = parser.parse_args(argv)

    titulo = args.titulo or input("Título: ")
    contenido = args.contenido if args.contenido is not None else pedir_contenido()

    if not titulo.strip():
        parser.error("el título no puede estar vacío")
    if not contenido.strip():
        parser.error("el contenido no puede estar vacío")

    ruta = guardar_nodo("idea", titulo, contenido)
    print(f"✔ Idea creada: {ruta.relative_to(RAIZ)}")

    if args.sin_build:
        print("  (graph.json no se reconstruyó; corre scripts/build_graph.py cuando quieras)")
        return 0

    # Reutilizamos build_graph como módulo en vez de lanzar otro proceso
    import build_graph
    return build_graph.main([])


if __name__ == "__main__":
    sys.exit(main())
