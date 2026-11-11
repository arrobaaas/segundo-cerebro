#!/usr/bin/env bash
# Configura los secretos de GitHub que usa la Action "Construir grafo".
#
# Uso (desde cualquier carpeta):
#     bash scripts/configurar_secretos.sh            # token de Claude + clave de PDFs
#     bash scripts/configurar_secretos.sh token      # solo el token de Claude
#     bash scripts/configurar_secretos.sh pdf        # solo la clave de PDFs
#
# - Token de Claude (CLAUDE_CODE_OAUTH_TOKEN): lo pegas sin que se vea en pantalla.
#   Se crea antes con `claude setup-token`. NO le saques captura a ese token.
# - Clave de PDFs (PDF_PRIVATE_KEY): se genera aquí y va directo a GitHub sin
#   guardarse en el disco. La parte pública se escribe en web/agregar.js
#   (después hay que hacer commit y push de ese archivo).
set -euo pipefail

cd "$(dirname "$0")/.."
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
QUE="${1:-todo}"

if [[ "$QUE" == "todo" || "$QUE" == "token" ]]; then
  echo "== Token de Claude (tu suscripción) =="
  echo "Pega el token de 'claude setup-token' (puede ocupar 2 líneas)."
  echo "No se verá lo que pegas. Al terminar, presiona Enter DOS veces."
  token=""
  while IFS= read -rs linea; do
    [[ -z "$linea" ]] && break
    token+="$linea"
  done
  token="${token//[[:space:]]/}"
  if [[ "$token" != sk-ant-oat* ]]; then
    echo "✘ Eso no parece un token de 'claude setup-token' (debe empezar con sk-ant-oat). No se guardó nada."
    exit 1
  fi
  printf '%s' "$token" | gh secret set CLAUDE_CODE_OAUTH_TOKEN -R "$REPO"
  unset token
  echo "✓ CLAUDE_CODE_OAUTH_TOKEN guardado."
fi

if [[ "$QUE" == "todo" || "$QUE" == "pdf" ]]; then
  echo "== Clave para cifrar PDFs =="
  privada=$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 2>/dev/null)
  publica=$(printf '%s\n' "$privada" | openssl pkey -pubout -outform DER | base64 -w0)
  printf '%s\n' "$privada" | gh secret set PDF_PRIVATE_KEY -R "$REPO"
  unset privada
  sed -i "s|^const CLAVE_PUBLICA_PDF = '.*';|const CLAVE_PUBLICA_PDF = '$publica';|" web/agregar.js
  echo "✓ PDF_PRIVATE_KEY guardado y clave pública actualizada en web/agregar.js."
  echo "  Falta subirla:  git commit -am 'web: nueva clave pública para PDFs' && git push"
fi

echo
gh secret list -R "$REPO"
