# Implementation Plan: Context-Aware Pie Menu Trigger

**Branch**: `002-context-pie-menu` | **Date**: 2025-10-19 | **Spec**: `specs/002-context-pie-menu/spec.md`
**Input**: Feature specification from `/specs/002-context-pie-menu/spec.md`

## Summary

Deliver context-sensitive invocation of the pie menu via global hotkey `Ctrl+Alt+Space` across Windows, macOS, and Linux. Before rendering the menu, the system must evaluate active window metadata, select the appropriate profile via `profile_router`, launch pie actions through the new `ActionRunner`, and surface success/failure feedback events to the UI, while reusing the existing hotkey conflict flow.

## Technical Context

**Language/Version**: Rust 1.75+ for Tauri backend, TypeScript 5.5 + React 18 for frontend  
**Primary Dependencies**: Tauri 2 (`@tauri-apps/api`, `@tauri-apps/cli`), Zustand state stores, Framer Motion for pie animation, existing window info and context rule services  
**Storage**: Versioned JSON via `autohotpie-tauri/src-tauri/src/storage/` (profiles, audit log)  
**Testing**: `cargo test`/`cargo nextest` for backend, `vitest` + `@testing-library/react` for hooks/components, Playwright e2e (`tests/e2e/pie-menu.spec.ts`) for hotkey → menu → action flow  
**Target Platform**: Desktop — Windows 10/11, macOS 13+, Linux (Wayland/X11)  
**Project Type**: Desktop hybrid (Tauri Rust backend + React frontend)  
**Performance Goals**: Menu visible < 0.5 s after hotkey, action feedback displayed < 1 s, no dropped frames in overlay (>60 FPS)  
**Constraints**: Must respect conflict detection from `hotkeys.rs`, operate offline, log all outcomes within 1 s, avoid disrupting fullscreen safe-mode guard  
**Scale/Scope**: Up to 50 profiles, 12 segments per menu, concurrent hotkey usage by single user session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Observation**: `.specify/memory/constitution.md` содержит placeholders без конкретных принципов; дополнительных ограничений не задано.  
- **Gate Status**: PASS — план не противоречит существующим правилам; повторная проверка после дизайна не требуется, но остаётся формальность.

## Project Structure

### Documentation (this feature)

```
specs/002-context-pie-menu/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
```

### Source Code (repository root)

```
autohotpie-tauri/
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── pie/PieMenu.tsx
│   │   ├── feedback/ActionToast.tsx
│   │   └── hotkeys/HotkeyConflictDialog.tsx
│   ├── hooks/
│   │   └── usePieMenuHotkey.ts
│   ├── state/
│   │   ├── appStore.ts
│   │   └── systemStore.ts
│   └── screens/
├── tests/
│   └── e2e/pie-menu.spec.ts
└── src-tauri/
    ├── src/
    │   ├── main.rs
    │   ├── commands/hotkeys.rs
    │   ├── services/
    │   │   ├── profile_router.rs
    │   │   ├── action_runner.rs
    │   │   └── audit_log.rs
    │   └── domain/context_rules.rs
    └── tauri.conf.json
```

**Structure Decision**: Реализуем фичу внутри существующего монорепозитория `autohotpie-tauri`, расширяя `profile_router`, `action_runner`, соответствующие React хуки/компоненты и Playwright сценарий.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

