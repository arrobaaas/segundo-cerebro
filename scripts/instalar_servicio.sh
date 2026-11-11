#!/usr/bin/env bash
# Instala (o quita) el servicio que procesa los videos de YouTube en tu computador.
# Es un servicio de "usuario" de systemd: no necesita sudo y corre mientras tienes
# la sesión iniciada.
#
#     bash scripts/instalar_servicio.sh            # instalar y arrancar
#     bash scripts/instalar_servicio.sh quitar     # detener y desinstalar
#     journalctl --user -u segundo-cerebro -f      # ver qué está haciendo
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
UNIDAD="$HOME/.config/systemd/user/segundo-cerebro.service"

if [[ "${1:-}" == "quitar" ]]; then
  systemctl --user disable --now segundo-cerebro.service 2>/dev/null || true
  rm -f "$UNIDAD"
  systemctl --user daemon-reload
  echo "✓ Servicio quitado. (La copia del repo sigue en ~/.local/share/segundo-cerebro; bórrala si quieres.)"
  exit 0
fi

PYTHON="$REPO/.venv/bin/python"
[[ -x "$PYTHON" ]] || { echo "✘ No encontré $PYTHON. Crea el entorno: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"; exit 1; }
CLAUDE="$(command -v claude)" || { echo "✘ No encontré Claude Code (comando claude)."; exit 1; }

mkdir -p "$(dirname "$UNIDAD")"
cat > "$UNIDAD" <<EOF
[Unit]
Description=Segundo Cerebro: procesa videos de YouTube agregados desde la página
After=network-online.target

[Service]
ExecStart=$PYTHON $REPO/scripts/servicio_local.py
# PATH con la carpeta de Claude Code ($(dirname "$CLAUDE")), git y gh
Environment=PATH=$(dirname "$CLAUDE"):/usr/local/bin:/usr/bin:/bin
Environment=PYTHONUNBUFFERED=1
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now segundo-cerebro.service
echo "✓ Servicio instalado y funcionando. Ver registro: journalctl --user -u segundo-cerebro -f"
