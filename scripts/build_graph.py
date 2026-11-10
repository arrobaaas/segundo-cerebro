"""
Construye web/graph.json a partir de los Markdown de ideas/, fuentes/ y fusionadas/.

Pasos:
  1. Lee todos los nodos (.md).
  2. Calcula un embedding por nodo: un vector de 384 números que representa
     su significado. Textos con significado parecido quedan con vectores
     parecidos, aunque usen palabras distintas (o incluso otro idioma).
  3. Compara todos los pares con similitud coseno y crea un enlace cuando
     supera el umbral.
  4. Los nodos que quedaron sin enlaces se conectan con su vecino más
     parecido (si supera un piso mínimo), para que no floten solos.
  5. Agrega enlaces "padre" (de cada fusionada a sus nodos de origen).
  6. Exporta graph.json.

Uso:
    python scripts/build_graph.py               # umbral 0.45
    python scripts/build_graph.py --umbral 0.4  # más conexiones
    python scripts/build_graph.py --umbral 0.55 # menos conexiones, más estrictas
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime

from cerebro import GRAPH_JSON, ErrorNodo, Nodo, leer_nodos, leer_perfil, ruta_plan

MODELO = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
# Empezamos en 0.6, pero con este modelo y textos cortos en español casi
# ningún par lo supera (la mediana ronda 0.3). 0.45 conecta lo que sí está
# relacionado sin meter ruido. Ajústalo con --umbral si el grafo crece.
UMBRAL_POR_DEFECTO = 0.45
# Un nodo aislado se une a su vecino más parecido solo si supera este piso
PISO_VECINO = 0.3


def calcular_similitudes(nodos: list[Nodo]):
    """Devuelve la matriz de similitud coseno entre todos los nodos (N x N)."""
    # Importamos aquí y no arriba: cargar PyTorch tarda unos segundos, y así
    # los errores simples (ej. un .md mal escrito) aparecen al instante.
    from sentence_transformers import SentenceTransformer

    print(f"Cargando modelo {MODELO} ...")
    print("(la primera vez se descarga, ~470 MB; después queda en caché)")
    modelo = SentenceTransformer(MODELO)

    textos = [n.texto_para_embedding() for n in nodos]
    # normalize_embeddings=True deja cada vector con largo 1. Con vectores
    # normalizados, la similitud coseno es simplemente el producto punto.
    vectores = modelo.encode(textos, normalize_embeddings=True, show_progress_bar=False)
    return vectores @ vectores.T


def construir_enlaces(nodos: list[Nodo], sim, umbral: float, piso: float = PISO_VECINO) -> list[dict]:
    """Crea los enlaces de similitud (sobre el umbral), vecino cercano y padre."""
    indice = {n.id: i for i, n in enumerate(nodos)}
    enlaces: dict[tuple[str, str], dict] = {}

    def clave(a: str, b: str) -> tuple[str, str]:
        # El orden no importa (A-B es lo mismo que B-A): usamos el par ordenado
        return (a, b) if a < b else (b, a)

    # 1) Similitud: recorremos solo la mitad de la matriz (j > i), sin repetir pares
    for i in range(len(nodos)):
        for j in range(i + 1, len(nodos)):
            s = float(sim[i, j])
            if s >= umbral:
                a, b = nodos[i].id, nodos[j].id
                enlaces[clave(a, b)] = {
                    "source": a, "target": b, "similitud": round(s, 3), "tipo": "similitud",
                }

    # 2) Vecino más cercano para los nodos que quedaron aislados.
    #    Contamos también a los padres: un nodo con padres no está aislado.
    conectados = {id_ for par in enlaces for id_ in par}
    conectados |= {n.id for n in nodos if n.padres}
    conectados |= {p for n in nodos for p in n.padres}
    for i, nodo in enumerate(nodos):
        if nodo.id in conectados or len(nodos) < 2:
            continue
        fila = sim[i].copy()
        fila[i] = -1  # excluir al propio nodo (su similitud consigo mismo es 1)
        j = int(fila.argmax())
        if fila[j] >= piso:
            a, b = nodo.id, nodos[j].id
            enlaces[clave(a, b)] = {
                "source": a, "target": b, "similitud": round(float(fila[j]), 3), "tipo": "similitud",
            }

    # 3) Padres: siempre se enlazan, aunque no superen el umbral.
    #    Si el par ya tenía enlace de similitud, lo reemplazamos por uno "padre".
    for nodo in nodos:
        for padre in nodo.padres:
            if padre not in indice:
                print(f"  ⚠ {nodo.id}: el padre '{padre}' no existe, se ignora")
                continue
            s = float(sim[indice[nodo.id], indice[padre]])
            enlaces[clave(nodo.id, padre)] = {
                "source": nodo.id, "target": padre, "similitud": round(s, 3), "tipo": "padre",
            }

    return list(enlaces.values())


def mostrar_resumen(nodos: list[Nodo], enlaces: list[dict], sim, umbral: float) -> None:
    """Imprime estadísticas útiles para decidir si el umbral está bien."""
    import numpy as np

    conectados = {e["source"] for e in enlaces} | {e["target"] for e in enlaces}
    aislados = [n for n in nodos if n.id not in conectados]
    por_tipo = {t: sum(e["tipo"] == t for e in enlaces) for t in ("similitud", "padre")}

    print(f"\n✔ {len(nodos)} nodos, {len(enlaces)} enlaces "
          f"({por_tipo['similitud']} por similitud, {por_tipo['padre']} padre)")

    if len(nodos) > 1:
        # Valores fuera de la diagonal (la diagonal es cada nodo consigo mismo = 1)
        pares = sim[np.triu_indices(len(nodos), k=1)]
        print(f"  Similitud entre pares: mín {pares.min():.2f} · "
              f"mediana {np.median(pares):.2f} · máx {pares.max():.2f}  (umbral {umbral})")

    if aislados:
        print(f"  Nodos sin conexiones ({len(aislados)}): "
              + ", ".join(n.id for n in aislados))
        print(f"  → Si son muchos, prueba bajar el umbral (ej. --umbral {umbral - 0.05:.2f}).")


def nodo_para_web(nodo: Nodo) -> dict:
    """El nodo en formato graph.json, más su plan de desarrollo si existe."""
    datos = nodo.a_dict()
    plan = ruta_plan(nodo.id)
    if plan.exists():
        datos["plan"] = plan.read_text(encoding="utf-8").strip()
    return datos


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genera web/graph.json desde los Markdown.")
    parser.add_argument("--umbral", type=float, default=UMBRAL_POR_DEFECTO,
                        help=f"similitud mínima para crear un enlace (por defecto {UMBRAL_POR_DEFECTO})")
    args = parser.parse_args(argv)

    if not 0 < args.umbral < 1:
        parser.error("el umbral debe estar entre 0 y 1")

    try:
        nodos = leer_nodos()
    except ErrorNodo as e:
        print(f"✘ Error en un nodo: {e}", file=sys.stderr)
        return 1

    if not nodos:
        print("No hay nodos todavía. Crea uno con: python scripts/agregar_idea.py \"título\"")
        return 1

    print(f"Leídos {len(nodos)} nodos.")
    sim = calcular_similitudes(nodos)
    enlaces = construir_enlaces(nodos, sim, args.umbral)

    datos = {
        # "meta" no lo usa la web todavía; sirve para saber cómo se generó
        "meta": {
            "generado": datetime.now().isoformat(timespec="seconds"),
            "modelo": MODELO,
            "umbral": args.umbral,
            # La web usa el perfil para armar los prompts de "Desarrollar con Claude"
            "perfil": leer_perfil(),
        },
        "nodes": [nodo_para_web(n) for n in nodos],
        "links": enlaces,
    }
    GRAPH_JSON.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False: guarda "á" en vez de "á", más fácil de leer
    GRAPH_JSON.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    mostrar_resumen(nodos, enlaces, sim, args.umbral)
    print(f"  Guardado en {GRAPH_JSON.relative_to(GRAPH_JSON.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
