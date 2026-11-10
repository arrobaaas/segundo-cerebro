"""
Conecta una idea del grafo con Claude para desarrollarla.

Dos modos:

  1) Plan de desarrollo (se guarda en planes/<id>.md y aparece en la web):
       python scripts/desarrollar.py idea-003

     Claude evalúa la viabilidad, propone el MVP, el stack y un plan por etapas
     donde cada etapa trae un PROMPT listo para copiar en Claude (o Claude Code).

  2) Pregunta rápida (la respuesta se muestra en la terminal, no se guarda):
       python scripts/desarrollar.py idea-003 -p "¿Qué base de datos me conviene?"

En ambos casos Claude recibe: tu perfil (perfil.md), la idea y las ideas
conectadas a ella en el grafo, para que la respuesta tenga tu contexto.

Agrega --manual para hacerlo GRATIS con tu cuenta de claude.ai (sin API):
       python scripts/desarrollar.py idea-003 --manual
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from cerebro import GRAPH_JSON, PLANES, RAIZ, ErrorNodo, Nodo, leer_nodos, leer_perfil, ruta_plan
from claude_cliente import ErrorClaude, pedir_texto, salir_con_error
from manual import entregar_prompt, recibir_respuesta

SYSTEM = """Eres un mentor técnico para un estudiante de Ingeniería en Informática que quiere
convertir sus ideas en proyectos reales y viables para su carrera y su portafolio.

Perfil del estudiante:
{perfil}

Responde en español. Sé concreto y honesto: si algo es demasiado grande para su nivel o su
tiempo, dilo y propone una versión más chica. Prefiere tecnologías gratuitas o con plan gratis.
Escribe en texto plano con Markdown simple (títulos con #, listas con -, bloques de código
con ```), sin tablas."""

PEDIDO_PLAN = """Crea un plan de desarrollo para esta idea, con estas secciones:

# Viabilidad
Dificultad (baja/media/alta), tiempo estimado con su disponibilidad, y qué aprenderá.

# MVP
La versión mínima que vale la pena terminar y mostrar. Qué entra y qué queda fuera.

# Stack recomendado
Lenguajes, frameworks, base de datos y dónde publicarlo, justificando cada elección.

# Plan por etapas
Entre 4 y 6 etapas. Para cada una: objetivo, entregable, y un PROMPT listo para copiar
en Claude (o Claude Code) que le pida ayuda con esa etapa. Cada prompt debe ser
autocontenido (incluir el contexto del proyecto y el stack) y pedir que le explique
las decisiones, porque está aprendiendo. Pon cada prompt en un bloque de código.

# Cómo mostrarlo
Cómo presentarlo en su portafolio, en GitHub y en una entrevista.

# Siguientes pasos
Qué agregar después del MVP si el proyecto funciona."""


def contexto_idea(nodo: Nodo, nodos: list[Nodo]) -> str:
    """Describe la idea y sus vecinos en el grafo (según graph.json)."""
    por_id = {n.id: n for n in nodos}
    vecinos: list[tuple[float, Nodo]] = []
    if GRAPH_JSON.exists():
        datos = json.loads(GRAPH_JSON.read_text(encoding="utf-8"))
        for e in datos.get("links", []):
            otro = e["target"] if e["source"] == nodo.id else e["source"] if e["target"] == nodo.id else None
            if otro in por_id:
                vecinos.append((e.get("similitud") or 0, por_id[otro]))
    vecinos.sort(key=lambda t: -t[0])

    texto = f"IDEA ({nodo.tipo}): {nodo.titulo}\n{nodo.contenido}\n"
    if nodo.fuente_url:
        texto += f"Fuente: {nodo.fuente_url}\n"
    if vecinos:
        texto += "\nIDEAS CONECTADAS EN SU SEGUNDO CEREBRO (pueden aportar contexto):\n"
        for sim, v in vecinos[:6]:
            # Solo el inicio de cada vecino, para no alargar demasiado el prompt
            resumen = v.contenido.split("\n\n")[0][:400]
            texto += f"- [{v.tipo}] {v.titulo}: {resumen}\n"
    return texto


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Desarrolla una idea del grafo con Claude.")
    parser.add_argument("id", help="id del nodo, ej. idea-003")
    parser.add_argument("-p", "--pregunta", help="haz una pregunta puntual en vez de generar el plan")
    parser.add_argument("--manual", action="store_true",
                        help="gratis: copiar el prompt a claude.ai en vez de usar la API")
    parser.add_argument("--sin-build", action="store_true", help="no reconstruir graph.json")
    args = parser.parse_args(argv)

    try:
        nodos = leer_nodos()
    except ErrorNodo as e:
        return salir_con_error(e)
    nodo = next((n for n in nodos if n.id == args.id), None)
    if not nodo:
        sugerencias = ", ".join(n.id for n in nodos[:8])
        return salir_con_error(ValueError(f"No existe el nodo '{args.id}'. Algunos ids: {sugerencias}..."))

    system = SYSTEM.format(perfil=leer_perfil())
    contexto = contexto_idea(nodo, nodos)

    if args.manual:
        if args.pregunta:
            # Para una pregunta basta con entregar el prompt: la respuesta la lees en Claude
            entregar_prompt(f"{system}\n\n{contexto}\nPREGUNTA: {args.pregunta}", "prompt_pregunta.txt")
            return 0
        entregar_prompt(f"{system}\n\n{contexto}\n{PEDIDO_PLAN}", "prompt_plan.txt")
        plan = recibir_respuesta("la respuesta completa (botón «Copy» bajo el plan)").strip()
        if len(plan) < 200:
            return salir_con_error(ValueError("La respuesta pegada es muy corta; no se guardó el plan."))
        return guardar_plan(nodo, plan, args.sin_build)

    try:
        if args.pregunta:
            print(f"🧠 Preguntándole a Claude sobre «{nodo.titulo}»...\n")
            respuesta = pedir_texto(system, f"{contexto}\nPREGUNTA: {args.pregunta}")
            print("\n" + respuesta)
            return 0

        print(f"🧠 Claude está armando el plan de «{nodo.titulo}» (puede tardar ~1 minuto)...")
        # Planificar es la tarea más "pensada": esfuerzo alto
        plan = pedir_texto(system, f"{contexto}\n{PEDIDO_PLAN}", esfuerzo="high")
    except ErrorClaude as e:
        return salir_con_error(e)

    return guardar_plan(nodo, plan, args.sin_build)


def guardar_plan(nodo: Nodo, plan: str, sin_build: bool) -> int:
    PLANES.mkdir(exist_ok=True)
    ruta = ruta_plan(nodo.id)
    encabezado = f"<!-- Plan generado por Claude el {date.today().isoformat()} para {nodo.id} -->\n\n"
    ruta.write_text(encabezado + plan + "\n", encoding="utf-8")
    print(f"✔ Plan guardado en {ruta.relative_to(RAIZ)}")

    if sin_build:
        return 0
    import build_graph
    return build_graph.main([])


if __name__ == "__main__":
    sys.exit(main())
