# apifor desktop (Tauri v2)

App desktop que empacota a **GUI (dashboard Next, export estático)** + roda o
**executor** como sidecar (serviço de fundo). Distribui instaladores Linux/Windows/macOS
com auto-update.

> ⚠️ **Scaffold build-ready, não compilado neste ambiente** — requer o toolchain
> Tauri v2 (Rust + webview), ícones em `src-tauri/icons/` e chaves de assinatura do
> updater. O build real roda no host ou no CI (`.github/workflows/release.yml`).

## Estrutura (presente)

```
desktop/
  package.json                    # @tauri-apps/cli
  src-tauri/
    tauri.conf.json               # janela, bundle, sidecar (externalBin), updater
    Cargo.toml / build.rs
    src/main.rs                   # abre a GUI + sobe o executor como sidecar
    capabilities/default.json     # permissões (shell/updater)
    bin/                          # (gerado no CI) apifor-executor-<target-triple>
    icons/                        # (faltam) icon.png/.ico/.icns
```

A GUI vem de `../dashboard` exportada (`NEXT_EXPORT=1 npm run build` → `out/`), com
`NEXT_PUBLIC_API_BASE` apontando p/ o cérebro remoto.

## Build local

```bash
cd app/dashboard && NEXT_EXPORT=1 NEXT_PUBLIC_API_BASE=https://api.apifor.dev npm run build
cargo build --release --manifest-path app/executor/Cargo.toml
cp app/executor/target/release/executor app/desktop/src-tauri/bin/apifor-executor-$(rustc -vV | sed -n 's/host: //p')
cd app/desktop && npm install && npm run build   # -> src-tauri/target/release/bundle/
```

## Release + auto-update (CI)

`git tag v0.1.0 && git push --tags` dispara `.github/workflows/release.yml`
(tauri-action) que builda os 3 alvos, assina e publica os instaladores + o
manifesto de update. Segredos: `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`.

## Falta p/ GA

- Ícones por plataforma · chaves de assinatura/notarização (Apple/Windows).
- Endpoint de releases (`releases.apifor.dev`) + `pubkey` real no `tauri.conf.json`.

## Sem desktop (VM)

[`../deploy/`](../deploy): `sudo ./install.sh` registra o executor como serviço
(systemd/launchd) — o caminho "deixar rodando na VM".
