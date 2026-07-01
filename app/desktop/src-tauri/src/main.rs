// apifor desktop (Tauri v2) — abre a GUI e sobe o executor (data plane) como sidecar.
// NOTA: scaffold — precisa do toolchain Tauri (`cargo tauri build`) e não foi
// compilado neste ambiente. O sidecar usa o binário em src-tauri/bin/apifor-executor.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // sobe o executor local como sidecar (serviço de fundo dentro do app).
            // best-effort: se o binário não existir (ex.: `tauri dev` sem build do
            // executor), apenas loga e segue — a GUI ainda abre.
            match app.shell().sidecar("apifor-executor").and_then(|s| s.spawn()) {
                Ok((mut rx, _child)) => {
                    tauri::async_runtime::spawn(async move {
                        while let Some(ev) = rx.recv().await {
                            if let CommandEvent::Stderr(line) | CommandEvent::Stdout(line) = ev {
                                eprintln!("[executor] {}", String::from_utf8_lossy(&line));
                            }
                        }
                    });
                }
                Err(e) => eprintln!("[desktop] sidecar apifor-executor indisponível ({e}); seguindo sem ele"),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o apifor desktop");
}
