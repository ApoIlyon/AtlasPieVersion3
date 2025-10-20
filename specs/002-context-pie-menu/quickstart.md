# Quickstart Guide: Context-Aware Pie Menu Trigger

## Prerequisites
- **Rust** 1.75+ with `cargo`
- **Node.js** 18 LTS with `npm`
- Global accessibility permissions enabled (Windows: UAC prompt, macOS: Privacy & Security → Accessibility, Linux: compositor allows global shortcuts)

## Setup
```bash
npm install
cargo fetch --manifest-path autohotpie-tauri/src-tauri/Cargo.toml
```

## Run in Development
```bash
npm run tauri dev
```
- Confirms global hotkey registration in console (`hotkeys.rs` logs `Ctrl+Alt+Space registered`).
- Keep terminal open to monitor ActionRunner event logs.

## Smoke Test the Feature
1. Focus an app with a configured context rule (e.g., VS Code profile).
2. Press `Ctrl+Alt+Space` and verify the pie menu reflects the matched profile.
3. Select a segment tied to a script/application and observe:
   - Overlay dismisses immediately.
   - Success toast appears (`actions://executed`).
4. Trigger an intentional failure (broken script path) to confirm error toast and audit entry.
5. Review `%APPDATA%/AutoHotPie/logs` (or platform equivalent) for `action_runner` entries.

## Handling Hotkey Conflicts
- If registration fails, the conflict dialog appears automatically.
- Resolve by adjusting system shortcut or reassigning via **Settings → Hotkeys**.
- After resolving, rerun `Ctrl+Alt+Space` and confirm dialog no longer blocks.

## Useful Commands
```bash
# Backend unit tests
cargo nextest run --manifest-path autohotpie-tauri/src-tauri/Cargo.toml --package action_runner

# Frontend hook/component tests
npm run test -- --run usePieMenuHotkey.test.ts

# Playwright flow verifying hotkey → menu → action
npx playwright test tests/e2e/pie-menu.spec.ts

# Regression: action feedback toasts + conflict gating
npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/action-execution.spec.ts --workers=1 --reporter=line
npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/hotkey-conflict.spec.ts --workers=1 --reporter=line
```

## Troubleshooting
- Pie menu not appearing: ensure window info service returns data (`profile_router` logs should show matches); fallback profile indicates no rule matches.
- Toasts absent
  - Confirm `usePieMenuHotkey.ts` receives `actions://executed` / `actions://failed` events and forwards them to `useAppStore().recordActionMetric()`.
  - Inspect `useAppStore().lastActionSummary` and `actionOutcomeCounts` values (DevTools console: `window.__APP_STORE__?.getState()` if exposed) to verify metrics update.
  - Re-run `npm run test -- --run usePieMenuHotkey.test.ts` for unit coverage and `npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/action-execution.spec.ts --workers=1 --reporter=line` for end-to-end validation.
- Slow feedback: profile evaluation and ActionRunner execution should complete < 1 s—check for long-running scripts or heavy process detection.
