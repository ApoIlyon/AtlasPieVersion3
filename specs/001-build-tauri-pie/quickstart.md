# Quickstart Guide: AutoHotPie Tauri Native Suite

## Prerequisites
- **Rust** 1.75+ with `cargo` (install via rustup)
- **Node.js** 18 LTS and `npm`
- **Tauri CLI** (`cargo install tauri-cli`)
- Windows: Visual Studio Build Tools (Desktop development with C++)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Linux: `libgtk-3-dev`, `libayatana-appindicator3-dev`, `webkit2gtk-4.1`, `pkg-config`

## Install Dependencies
```bash
npm install
cargo fetch --manifest-path src-tauri/Cargo.toml
```

## Run in Development
```bash
npm run tauri dev
```
This launches the React frontend with hot reload and the Tauri backend.

## Build Release Artifacts
```bash
npm run tauri build
```
Output installers/bundles appear under `src-tauri/target/release/` (per-platform).

## Run Tests
```bash
# Rust unit/integration tests
cargo nextest run --manifest-path src-tauri/Cargo.toml

# Frontend unit tests
npm run test

# Playwright smoke E2E (Windows/Linux PR matrix)
npx playwright test --config tests/e2e/playwright.config.ts
```
For macOS nightly coverage, run the Playwright suite locally or via scheduled CI on `macos-latest`.

## Configuration & Data Paths
- Windows: `%APPDATA%/AutoHotPie`
- macOS: `~/Library/Application Support/AutoHotPie`
- Linux: `~/.config/AutoHotPie`

Logs rotate daily under the same directory; the **Log** button opens the current file.

## Import/Export Profiles
1. Use **Settings → Profiles → Import** to select a JSON bundle.
2. Export via **Profiles Dashboard → Export** to create a JSON archive compatible across platforms.

## Update Check Workflow
- App checks GitHub releases on menu open (hourly throttle).
- If a new version exists, notification shows **Download Update** linking to the latest installer.

## Troubleshooting
- Global hotkey conflicts: see **Settings → Hotkeys**; reassign or disable conflicting bindings.
- Missing tray icon on Linux: ensure `libayatana-appindicator3` installed; fallback UI enabled otherwise.
- Accessibility prompts on macOS: enable permissions under **System Settings → Privacy & Security → Accessibility**.
