# AutoHotPie Tauri

AutoHotPie Tauri is the desktop shell for the AutoHotPie profile editor and pie-menu runtime. The app bundles the React front end with a Tauri backend so we can edit automation profiles, manage hotkeys, and interact with the Tauri command surface.

## Local development

- `npm install`
- `npm run dev` — start Vite + Tauri dev server

## Test matrix

- `npm run test:unit` — Vitest in single-run mode (used by the pre-commit hook)
- `npm run cargo:test` — Rust unit tests for the Tauri backend
- `npm run test:e2e` — Playwright end-to-end suite
- `npm run check:all` — sequentially runs the three commands above (hooked on pre-push)
s