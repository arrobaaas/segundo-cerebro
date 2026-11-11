"""
Convierte en nodos "idea" las ideas de proyecto que están escritas DENTRO de las
fuentes antiguas (antes, cada fuente guardaba sus ideas como texto; ahora cada idea
es una estrella propia enlazada a su fuente).

No usa IA: lee la sección "Ideas de proyecto que inspira" de cada fuente. Si una
fuente ya tiene ideas hijas, la salta (se puede correr varias veces sin duplicar).

Uso:
    python scripts/extraer_ideas.py            # crea los nodos y reconstruye el grafo
    python scripts/extraer_ideas.py --probar   # solo muestra qué crearía
"""

from __future__ import annotations

import argparse
import re
import sys

from cerebro import guardar_nodo, leer_nodos

SECCION = re.compile(r"^Ideas de proyecto que inspira[^\n]*:\n((?:•[^\n]*\n?)+)", re.MULTILINE)


def separar(linea: str) -> tuple[str, str, str]:
    """'• Nombre: Descripción. MVP: ...' -> (nombre, descripción, mvp).

    El nombre puede tener ':' ("AgentForge: banco de pruebas"), así que cortamos en
    el primer ': ' seguido de MAYÚSCULA, que es donde empieza la descripción.
    """
    texto = linea.lstrip("• ").strip()
    texto, _, mvp = texto.partition(" MVP: ")
    corte = re.search(r": (?=[A-ZÁÉÍÓÚÑ¿¡])", texto) or re.search(r": ", texto)
    if not corte:
        return texto, "", mvp.strip()
    return texto[:corte.start()].strip(), texto[corte.end():].strip(), mvp.strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Crea nodos idea desde las fuentes antiguas.")
    parser.add_argument("--probar", action="store_true", help="no crear nada, solo mostrar")
    args = parser.parse_args(argv)

    nodos = leer_nodos()
    con_hijas = {padre for n in nodos if n.tipo == "idea" for padre in n.padres}
    creadas = 0
    for fuente in (n for n in nodos if n.tipo == "fuente"):
        seccion = SECCION.search(fuente.contenido + "\n")
        if not seccion or fuente.id in con_hijas:
            continue
        print(f"{fuente.id}: {fuente.titulo}")
        for linea in seccion.group(1).strip().splitlines():
            nombre, descripcion, mvp = separar(linea)
            if not nombre:
                continue
            partes = [descripcion] if descripcion else []
            if mvp:
                partes.append(f"MVP: {mvp}")
            partes.append(f"Nació de la fuente: {fuente.titulo}")
            if args.probar:
                print(f"  (probar) 💡 {nombre}")
                continue
            # Sin categoría: build_graph le asigna el tema más parecido (embeddings)
            ruta = guardar_nodo("idea", nombre, "\n\n".join(partes), padres=[fuente.id])
            print(f"  💡 {ruta.stem}: {nombre}")
            creadas += 1

    if args.probar or not creadas:
        print("No se creó nada." if not args.probar else "")
        return 0
    print(f"✔ {creadas} ideas nuevas.")
    import build_graph
    return build_graph.main([])


if __name__ == "__main__":
    sys.exit(main())
