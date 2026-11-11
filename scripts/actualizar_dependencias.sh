#!/usr/bin/env bash
# Regenera requirements.lock: TODAS las dependencias (también las indirectas) con
# versión exacta y huella SHA-256. La GitHub Action instala con --require-hashes,
# así que si alguien alterara un paquete en PyPI, la instalación fallaría en vez de
# ejecutar código modificado con tus claves.
#
# Úsalo después de cambiar requirements.txt:
#     bash scripts/actualizar_dependencias.sh
# Luego: git commit, git push y bash scripts/confiar_codigo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

HERRAMIENTAS="$(mktemp -d)"
trap 'rm -rf "$HERRAMIENTAS" _lock.in' EXIT
python3 -m venv "$HERRAMIENTAS"
"$HERRAMIENTAS/bin/pip" install --quiet pip-tools==7.6.2

# torch se instala en su versión CPU (mucho más liviana) desde el índice de PyTorch
printf -- '-r requirements.txt\ntorch  # versión CPU, desde el índice de PyTorch\n' > _lock.in
"$HERRAMIENTAS/bin/pip-compile" --quiet --generate-hashes --allow-unsafe --strip-extras \
  --annotation-style line --no-emit-index-url \
  --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple \
  --output-file requirements.lock _lock.in
echo "✓ requirements.lock actualizado ($(grep -c '==' requirements.lock) paquetes fijados)."
