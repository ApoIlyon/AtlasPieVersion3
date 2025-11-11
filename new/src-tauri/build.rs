#[cfg(all(target_os = "windows"))]
use std::path::{Path, PathBuf};

fn main() {
    tauri_build::build();

    #[cfg(all(target_os = "windows"))]
    {
        if let Err(err) = copy_webview2_loader() {
            println!("cargo:warning=failed to prepare WebView2Loader.dll: {err}");
        }
    }
}

#[cfg(all(target_os = "windows"))]
fn copy_webview2_loader() -> std::io::Result<()> {
    use std::env;
    use std::fs;
    use std::io;
    use std::path::PathBuf;

    let out_dir = PathBuf::from(env::var("OUT_DIR").map_err(|err| {
        io::Error::new(
            io::ErrorKind::Other,
            format!("OUT_DIR not available: {err}"),
        )
    })?);
    let profile_dir = out_dir
        .ancestors()
        .nth(3)
        .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "invalid OUT_DIR layout"))?
        .to_path_buf();
    let build_dir = profile_dir.join("build");

    let arch_var = env::var("CARGO_CFG_TARGET_ARCH").map_err(|err| {
        io::Error::new(
            io::ErrorKind::Other,
            format!("target arch not available: {err}"),
        )
    })?;
    let arch = match arch_var.as_str() {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "x86",
        other => other,
    };

    let loader = find_webview2_loader(&build_dir, arch)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "WebView2Loader.dll not found"))?;

    let deps_dir = profile_dir.join("deps");
    if !deps_dir.exists() {
        fs::create_dir_all(&deps_dir)?;
    }

    let targets = [
        deps_dir.join("WebView2Loader.dll"),
        profile_dir.join("WebView2Loader.dll"),
    ];
    for target in targets {
        fs::copy(&loader, target)?;
    }

    Ok(())
}

#[cfg(all(target_os = "windows"))]
fn find_webview2_loader(build_dir: &Path, arch: &str) -> Option<PathBuf> {
    use std::fs;

    let entries = fs::read_dir(build_dir).ok()?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with("webview2-com-sys-") {
            continue;
        }
        let candidate = path.join("out").join(arch).join("WebView2Loader.dll");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}
