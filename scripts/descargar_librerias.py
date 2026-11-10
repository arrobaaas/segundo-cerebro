"""
Descarga las librerías JavaScript de la web (3d-force-graph, Three.js, ...) y las
guarda DENTRO del repositorio, en web/vendor/.

¿Por qué? Si la página cargara scripts desde un servidor externo (un CDN), ese
código correría con los mismos permisos que la página: si alguien comprometiera
el CDN, podría leer el token de GitHub guardado en tu navegador. Con las
librerías en el repo, la página solo ejecuta código que está versionado aquí, y
podemos prohibir cualquier script externo con una política CSP (ver index.html).

Uso (solo cuando quieras actualizar las versiones):
    python scripts/descargar_librerias.py

Cómo funciona: jsDelivr ofrece cada paquete npm como módulo ES ("+esm"). Esos
módulos importan otros con rutas como "/npm/three@0.186.1/+esm". Los descargamos
todos (recursivamente), los guardamos con nombres de archivo planos y
reescribimos los imports para que apunten a las copias locales.
"""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request

from cerebro import RAIZ

CDN = "https://cdn.jsdelivr.net"
# Los puntos de entrada que usa web/app.js (versiones fijas)
ENTRADAS = {
    "3d-force-graph.js": "/npm/3d-force-graph@1.80.1/+esm",
    "three.js": "/npm/three@0.186.1/+esm",
    "UnrealBloomPass.js": "/npm/three@0.186.1/examples/jsm/postprocessing/UnrealBloomPass.js/+esm",
}
DESTINO = RAIZ / "web" / "vendor"

# Cualquier texto entre comillas que sea una ruta de módulo de jsDelivr
PATRON_RUTA = re.compile(r"""(["'])(/npm/[^"'\s]+)\1""")


def nombre_local(ruta: str) -> str:
    """'/npm/three@0.186.1/examples/jsm/x.js/+esm' -> 'three@0.186.1__examples__jsm__x.js.js'"""
    limpio = ruta.removeprefix("/npm/").removesuffix("/+esm")
    return limpio.replace("/", "__") + ("" if limpio.endswith(".js") else ".js")


def descargar(ruta: str) -> str:
    peticion = urllib.request.Request(CDN + ruta, headers={"User-Agent": "segundo-cerebro"})
    with urllib.request.urlopen(peticion, timeout=60) as r:
        return r.read().decode("utf-8")


def main() -> int:
    DESTINO.mkdir(parents=True, exist_ok=True)
    for viejo in DESTINO.glob("*.js"):
        viejo.unlink()

    pendientes = list(ENTRADAS.values())
    vistos: set[str] = set()
    huellas: dict[str, str] = {}

    while pendientes:
        ruta = pendientes.pop()
        if ruta in vistos:
            continue
        vistos.add(ruta)
        codigo = descargar(ruta)

        # Encolar las dependencias y reescribir sus rutas a archivos locales
        for _, dependencia in PATRON_RUTA.findall(codigo):
            pendientes.append(dependencia)
        codigo = PATRON_RUTA.sub(lambda m: f'{m.group(1)}./{nombre_local(m.group(2))}{m.group(1)}', codigo)
        # Quitar referencias a source maps (apuntan al CDN y no las necesitamos)
        codigo = re.sub(r"^//# sourceMappingURL=.*$", "", codigo, flags=re.MULTILINE)

        archivo = DESTINO / nombre_local(ruta)
        archivo.write_text(codigo, encoding="utf-8")
        huellas[archivo.name] = hashlib.sha256(codigo.encode("utf-8")).hexdigest()
        print(f"  {archivo.name}  ({len(codigo) // 1024} KB)")

    # Alias con nombres simples para los puntos de entrada que importa app.js
    for alias, ruta in ENTRADAS.items():
        (DESTINO / alias).write_text(f'export * from "./{nombre_local(ruta)}";\n'
                                     + (f'export {{ default }} from "./{nombre_local(ruta)}";\n'
                                        if alias == "3d-force-graph.js" else ""),
                                     encoding="utf-8")

    # Registro de lo descargado, con la huella SHA-256 de cada archivo: si alguien
    # modificara una librería, el cambio se notaría en el diff de este archivo.
    (DESTINO / "versiones.json").write_text(json.dumps(
        {"fuente": CDN, "entradas": ENTRADAS, "sha256": dict(sorted(huellas.items()))},
        indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    total = sum(f.stat().st_size for f in DESTINO.glob("*.js")) // 1024
    print(f"✔ {len(vistos)} módulos en web/vendor/ ({total} KB en total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
