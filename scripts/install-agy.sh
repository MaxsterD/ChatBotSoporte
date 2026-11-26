#!/usr/bin/env bash
set -e

echo "=== Verificando instalacion de Antigravity CLI (agy) ==="

if command -v agy >/dev/null 2>&1; then
  echo "agy ya esta instalado en: $(command -v agy)"
  agy --version || true
  exit 0
fi

if [ -f "/root/.local/bin/agy" ]; then
  mkdir -p /usr/local/bin 2>/dev/null || true
  cp -f /root/.local/bin/agy /usr/local/bin/agy 2>/dev/null || true
  chmod +x /usr/local/bin/agy 2>/dev/null || true
  echo "agy encontrado en /root/.local/bin y copiado a /usr/local/bin"
  exit 0
fi

if [ -f "$HOME/.local/bin/agy" ]; then
  mkdir -p /usr/local/bin 2>/dev/null || true
  cp -f "$HOME/.local/bin/agy" /usr/local/bin/agy 2>/dev/null || true
  chmod +x /usr/local/bin/agy 2>/dev/null || true
  echo "agy encontrado en $HOME/.local/bin y copiado a /usr/local/bin"
  exit 0
fi

echo "Descargando e instalando Antigravity CLI..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL https://antigravity.google/cli/install.sh | bash || true
elif command -v wget >/dev/null 2>&1; then
  wget -qO- https://antigravity.google/cli/install.sh | bash || true
fi

for bin_path in "$HOME/.local/bin/agy" "/root/.local/bin/agy"; do
  if [ -f "$bin_path" ]; then
    mkdir -p /usr/local/bin 2>/dev/null || true
    cp -f "$bin_path" /usr/local/bin/agy 2>/dev/null || true
    chmod +x /usr/local/bin/agy 2>/dev/null || true
    echo "agy copiado con exito a /usr/local/bin/agy"
    break
  fi
done

if command -v agy >/dev/null 2>&1; then
  echo "Antigravity CLI instalado exitosamente:"
  agy --version || true
elif [ -f "/usr/local/bin/agy" ]; then
  echo "Antigravity CLI instalado en /usr/local/bin/agy:"
  /usr/local/bin/agy --version || true
else
  echo "Aviso: No se pudo verificar la instalacion de agy. El servidor usara fallback si es necesario."
fi
