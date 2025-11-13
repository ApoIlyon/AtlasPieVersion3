use tauri::{AppHandle, Runtime};

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
                Ok((stream, _peer)) => {
                    let mut buf = [0u8; 64];
                    let n = match stream.readable().await {
                        Ok(_) => match stream.try_read(&mut buf) {
                            Ok(n) => n,
                            Err(err) => {
                                eprintln!("toggle server read failed: {err}");
                                0
                            }
                        },
                        Err(err) => {
                            eprintln!("toggle server readiness failed: {err}");
                            0
                        }
                    };
                    let msg = String::from_utf8_lossy(&buf[..n]).to_string();
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
