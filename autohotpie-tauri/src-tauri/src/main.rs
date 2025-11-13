// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--toggle") {
        use std::io::Write;
        if let Ok(mut stream) = std::net::TcpStream::connect(("127.0.0.1", 16738)) {
            let _ = stream.write_all(b"TOGGLE\n");
        }
        return;
    }
    autohotpie_tauri_lib::run()
}
