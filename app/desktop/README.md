# apifor desktop (Tauri) — scaffold do M7

> ⚠️ **Scaffold** — precisa do toolchain Tauri v2 (Rust + webview + Node) e de
> certificados de assinatura p/ gerar instaladores. **Não foi buildado/validado**
> neste ambiente; é o ponto de partida do app desktop.

App desktop que empacota a **GUI (dashboard Next, exportado estático)** + roda o
**executor** como serviço de fundo. Distribui instaladores Linux/Windows/macOS.

## Estrutura alvo

```
desktop/
  src-tauri/
    tauri.conf.json     # janela, bundle, sidecar (executor), updater
    Cargo.toml
    src/main.rs         # abre a GUI; instala/inicia o serviço do executor
    bin/                # binário do executor por alvo (sidecar)
  (frontend = ../dashboard exportado: `next build && next export` -> out/)
```

## Build (no host com Tauri)

```bash
# 1. GUI estática
cd ../dashboard && npm i && npm run build   # gere o export estático (out/)
# 2. binário do executor por alvo -> desktop/src-tauri/bin/apifor-executor-<target-triple>
cargo build --release --manifest-path ../executor/Cargo.toml
# 3. instalador
cd ../desktop && npm i -g @tauri-apps/cli && tauri build
#    -> bundles em src-tauri/target/release/bundle/ (.deb/.AppImage/.msi/.dmg)
```

## Serviço de fundo (sem desktop, ex.: VM Linux)

Veja [`../deploy/`](../deploy): `sudo ./install.sh` builda o executor e registra o
serviço (systemd no Linux, launchd no macOS). É o caminho "deixar rodando na VM".

## Pendências (M7)

- `tauri.conf.json` completo (sidecar + updater + ícones) e assinatura por plataforma.
- Auto-update (endpoint de releases assinado).
- Onboarding/preços já estão na GUI (telas `/onboarding` e `/pricing`).
