# Tasks: Pie Menu Complete Redesign and Overhaul

Feature: Pie Menu Complete Redesign and Overhaul

## Phase 1: Setup

- [ ] T001 Align Kando visual tokens (accent, spacing) in `autohotpie-tauri/src/styles.css`
- [ ] T002 Verify Tauri IPC routes for overlay and system status in `autohotpie-tauri/src-tauri/src/services/mod.rs`

## Phase 2: Foundational

- [ ] T003 Implement base animation toggles (ease-in-out 300ms) in `autohotpie-tauri/src/components/pie/PieMenu.tsx`
- [ ] T004 Sync activation mode to overlay state in `autohotpie-tauri/src/App.tsx`

## Phase 3: User Story 1 — Redesigned pie menu with smooth animations (P1)

- [ ] T005 [US1] Apply Kando-like styles (colors/radii/shadows) in `autohotpie-tauri/src/components/pie/PieMenu.tsx`
- [ ] T006 [P] [US1] Add UI toggle to enable/disable animations in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [ ] T007 [US1] Ensure overlay respects animation settings in `autohotpie-tauri/src/pie-overlay/main.tsx`
- [ ] T008 [US1] Persist visual style settings per menu in `autohotpie-tauri/src/state/profileStore.ts`

## Phase 4: User Story 2 — Manage slices with visual editing (P1)

- [ ] T009 [US2] Create Pie Menu (create) action in `autohotpie-tauri/src/state/profileStore.ts`
- [ ] T010 [US2] Create Pie Menu (delete) action in `autohotpie-tauri/src/state/profileStore.ts`
- [ ] T011 [P] [US2] Add UI for create/delete menus in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [ ] T012 [US2] Show helper hints for slice functions in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [ ] T013 [US2] Visualize assigned actions for each slice in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`

## Phase 5: User Story 3 — Multiple profiles with app binding (P2)

- [ ] T014 [US3] Implement profile create/delete UI in `autohotpie-tauri/src/App.tsx`
- [ ] T015 [US3] Bind profile to app via context rules in `autohotpie-tauri/src/components/profile-editor/ContextConditionsPanel.tsx`
- [ ] T016 [US3] Activate profile and persist routing in `autohotpie-tauri/src-tauri/src/commands/profiles.rs`

## Phase 6: User Story 4 — Context conditions with auto-detection (P2)

- [ ] T017 [US4] Implement 5‑second auto-detect app rule in `autohotpie-tauri/src/components/profile-editor/ContextConditionsPanel.tsx`
- [ ] T018 [US4] Consume `system://window-info` for auto-fill in `autohotpie-tauri/src/state/systemStore.ts`
- [ ] T019 [US4] Visual indicator of active rules in `autohotpie-tauri/src/components/profile-editor/ContextConditionsPanel.tsx`

## Phase 7: User Story 5 — Remove hotkey registration (P3)

- [ ] T020 [US5] Remove Hotkey Registration UI from `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [ ] T021 [US5] Disable hotkey registration path in `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`

## Phase 8: User Story 6 — Custom actions and scenarios (P2)

- [ ] T022 [US6] Actions sidebar: list, filters, drag‑drop in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [ ] T023 [US6] Extend action model (steps/validation) in `autohotpie-tauri/src/types/actions.ts`
- [ ] T024 [US6] Execute action and show toast in `autohotpie-tauri/src/App.tsx`
- [ ] T025 [P] [US6] Drag‑drop bind action to slice in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`

## Phase 9: User Story 7 — Export and updates (P3)

- [ ] T026 [US7] Export profiles UI in `autohotpie-tauri/src/components/settings/SettingsImportExport.tsx`
- [ ] T027 [US7] Update checker UI and service in `autohotpie-tauri/src-tauri/src/services/update_checker.rs`
- [ ] T028 [US7] Implement embedded update flow (no manual download) in `autohotpie-tauri/src-tauri/src/services/update_checker.rs`

## Phase 10: User Story 8 — Logs with filtering and search (P3)

- [ ] T029 [US8] Implement filtering/search in `autohotpie-tauri/src/components/log/LogPanel.tsx`
- [ ] T030 [US8] Enhance log entry visualization in `autohotpie-tauri/src/components/log/LogPanel.tsx`

## Phase 11: User Story 9 — Unified modern UI/UX (P1)

- [ ] T031 [US9] Update navigation and section layout in `autohotpie-tauri/src/App.tsx`
- [ ] T032 [P] [US9] Improve responsive tokens and typography in `autohotpie-tauri/src/styles.css`

## Dependencies

- US1 → US2 → US3/US4 → US5 → US6 → US7/US8 → US9
- Overlay/IPC (T004, T007) precede activation-dependent tasks (T014–T016, T017–T019)

## Parallel Execution Examples

- [P] T006 — UI toggle animations can proceed with T005 styling
- [P] T011 — Menu UI can proceed in parallel with T009–T010 actions
- [P] T025 — Slice action DnD can proceed with T023 model extension
- [P] T032 — Responsive tokens can proceed alongside T031 navigation updates

## Implementation Strategy

- MVP: US1 + US2 — animated redesigned menu and slice editor with create/delete and DnD
- Incremental delivery by story; each phase independently testable via UI and services

## Report

- Path: `specs/001-pie-menu-overhaul/tasks.md`
- Total tasks: 32
- Story counts: US1 — 4, US2 — 5, US3 — 3, US4 — 3, US5 — 2, US6 — 4, US7 — 3, US8 — 2, US9 — 2
- Parallel opportunities: 4
- Independent test criteria: per story in `specs/001-pie-menu-overhaul/spec.md`
- Suggested MVP: US1 + US2