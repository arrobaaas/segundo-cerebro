#!/usr/bin/env bash
# Marca tu código actual como "confiable" para la GitHub Action.
#
# La Action solo ejecuta (con tus claves) el código del commit fijado en
# .github/workflows/construir-grafo.yml (CODIGO_CONFIABLE). Así, aunque alguien
# robara el token de la página y subiera código malicioso, no podría usarlo con tus
# claves: cambiar ese archivo exige el permiso "workflow", que ese token no tiene.
#
# Úsalo después de cambiar algo en scripts/ o en las dependencias y hacer git push:
#     bash scripts/confiar_codigo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
WORKFLOW=.github/workflows/construir-grafo.yml

git fetch --quiet origin
if [[ -n "$(git status --porcelain -- scripts requirements.txt requirements.lock "$WORKFLOW")" ]]; then
  echo "✘ Tienes cambios sin guardar en scripts/, requirements.txt/.lock o el workflow. Haz commit y push primero."
  exit 1
fi
SHA=$(git rev-parse HEAD)
if ! git merge-base --is-ancestor "$SHA" origin/main; then
  echo "✘ Tu último commit no está en GitHub (o tu copia está desactualizada). Haz git pull y git push primero."
  exit 1
fi

ACTUAL=$(grep -oE 'CODIGO_CONFIABLE: [0-9a-f]{40}' "$WORKFLOW" | cut -d' ' -f2)
if [[ -z "$(git diff --name-only "$ACTUAL" "$SHA" -- scripts requirements.txt requirements.lock)" ]]; then
  echo "✓ El código no cambió desde el commit confiable (${ACTUAL:0:7}). No hay nada que hacer."
  exit 0
fi

echo "Cambios en el código desde el commit confiable anterior (${ACTUAL:0:7} → ${SHA:0:7}):"
git log --oneline "$ACTUAL..$SHA" -- scripts requirements.txt requirements.lock
git diff --stat "$ACTUAL" "$SHA" -- scripts requirements.txt requirements.lock
echo
echo "Revisa que TODOS esos commits sean tuyos (git diff ${ACTUAL:0:7} ${SHA:0:7} -- scripts)."
read -rp "¿Confías en este código? (s/N) " respuesta
[[ "$respuesta" == "s" || "$respuesta" == "S" ]] || { echo "Cancelado."; exit 1; }

sed -i -E "s/CODIGO_CONFIABLE: [0-9a-f]{40}/CODIGO_CONFIABLE: $SHA/" "$WORKFLOW"
git commit --quiet -m "seguridad: confiar en el código ${SHA:0:7}" -- "$WORKFLOW"
git push --quiet
echo "✓ La Action ahora usa el código ${SHA:0:7}."
