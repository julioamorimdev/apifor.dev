#!/usr/bin/env bash
# install.sh — builda o executor e registra o serviço de fundo (Linux/systemd ou
# macOS/launchd). É o caminho "baixar, instalar, deixar rodando na VM" do M7.
#
#   sudo ./install.sh            # build + instala binário + registra + inicia
#   sudo ./install.sh uninstall  # para + remove o serviço
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN=/usr/local/bin/apifor-executor
OS="$(uname -s)"

build() {
  echo "==> build do executor (cargo release)"
  if ! command -v cargo >/dev/null; then echo "precisa de Rust/cargo no host"; exit 1; fi
  ( cd "$HERE/../executor" && cargo build --release )
  install -m 0755 "$HERE/../executor/target/release/executor" "$BIN"
  echo "    binário em $BIN"
}

install_linux() {
  build
  install -m 0644 "$HERE/apifor-executor.service" /etc/systemd/system/apifor-executor.service
  systemctl daemon-reload
  systemctl enable --now apifor-executor
  echo "==> serviço systemd ativo:  systemctl status apifor-executor"
}

install_macos() {
  build
  local plist="$HOME/Library/LaunchAgents/dev.apifor.executor.plist"
  mkdir -p "$HOME/Library/LaunchAgents" /usr/local/var/apifor /usr/local/var/log
  install -m 0644 "$HERE/dev.apifor.executor.plist" "$plist"
  launchctl unload "$plist" 2>/dev/null || true
  launchctl load -w "$plist"
  echo "==> launchd carregado:  launchctl list | grep apifor"
}

uninstall() {
  case "$OS" in
    Linux)  systemctl disable --now apifor-executor 2>/dev/null || true
            rm -f /etc/systemd/system/apifor-executor.service; systemctl daemon-reload ;;
    Darwin) launchctl unload -w "$HOME/Library/LaunchAgents/dev.apifor.executor.plist" 2>/dev/null || true
            rm -f "$HOME/Library/LaunchAgents/dev.apifor.executor.plist" ;;
  esac
  rm -f "$BIN"
  echo "==> serviço removido"
}

case "${1:-install}" in
  install)   case "$OS" in Linux) install_linux ;; Darwin) install_macos ;; *) echo "OS não suportado: $OS"; exit 1 ;; esac ;;
  uninstall) uninstall ;;
  *) echo "uso: $0 [install|uninstall]"; exit 1 ;;
esac
