use anyhow::Context;
use tauri::{AppHandle, Runtime};
use tokio::io::AsyncReadExt;

const TOGGLE_PORT: u16 = 16738;

pub fn start_toggle_server<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], TOGGLE_PORT));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(err) => {
                eprintln!("toggle server bind failed: {err}");
                return;
            }
        };

        loop {
            match listener.accept().await {
                Ok((mut stream, _peer)) => {
                    let mut buf = Vec::with_capacity(64);
                    let mut tmp = [0u8; 64];
                    match stream.read(&mut tmp).await {
                        Ok(n) if n > 0 => buf.extend_from_slice(&tmp[..n]),
                        Ok(_) => {}
                        Err(err) => eprintln!("toggle server read failed: {err}"),
                    }
                    let msg = String::from_utf8_lossy(&buf).to_string();
                    if msg.trim().eq_ignore_ascii_case("TOGGLE") {
                        let _ = crate::commands::toggle::toggle_pie_menu(app.clone());
                    }
                }
                Err(err) => {
                    eprintln!("toggle server accept failed: {err}");
                }
            }
        }
    });
}
