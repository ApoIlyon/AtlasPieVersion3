# AtlasPieVersion3 Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-17

## Active Technologies
- Rust 1.75+ (Tauri backend commands), Node.js 18 + TypeScript/React 18 (frontend) + Tauri 1.x, @tauri-apps/plugin-global-shortcut, @tauri-apps/plugin-store, React 18, Zustand/Recoil, Tailwind/Chakra (theme TBD), Serde/Tokio, crossbeam, OS-specific API через Tauri (001-build-tauri-pie)
- Rust 1.75+ for Tauri backend, TypeScript 5.5 + React 18 for frontend + Tauri 2 (`@tauri-apps/api`, `@tauri-apps/cli`), Zustand state stores, Framer Motion for pie animation, existing window info and context rule services (002-context-pie-menu)
- Versioned JSON via `autohotpie-tauri/src-tauri/src/storage/` (profiles, audit log) (002-context-pie-menu)

## Project Structure
```
src/
tests/
```

## Commands
cargo test; cargo clippy

## Code Style
Rust 1.75+ (Tauri backend commands), Node.js 18 + TypeScript/React 18 (frontend): Follow standard conventions

## Recent Changes
- 002-context-pie-menu: Added Rust 1.75+ for Tauri backend, TypeScript 5.5 + React 18 for frontend + Tauri 2 (`@tauri-apps/api`, `@tauri-apps/cli`), Zustand state stores, Framer Motion for pie animation, existing window info and context rule services
- 001-build-tauri-pie: Added Rust 1.75+ (Tauri backend commands), Node.js 18 + TypeScript/React 18 (frontend) + Tauri 1.x, @tauri-apps/plugin-global-shortcut, @tauri-apps/plugin-store, React 18, Zustand/Recoil, Tailwind/Chakra (theme TBD), Serde/Tokio, crossbeam, OS-specific API через Tauri

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
