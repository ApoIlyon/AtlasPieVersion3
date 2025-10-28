# Tasks: AutoHotPie Tauri Native Suite

**Input**: Design documents from `/specs/001-build-tauri-pie/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Explicit test tasks are included only where they deliver clear coverage for the user stories.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Frontend: `autohotpie-tauri/src/`
- Backend (Tauri/Rust): `autohotpie-tauri/src-tauri/src/`
- Tests & scripts: `autohotpie-tauri/tests/`, `autohotpie-tauri/scripts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the toolchain, styling system, and cross-platform project scaffolding.

- [x] T001 Upgrade `autohotpie-tauri/package.json` and regenerate lockfile to enable React 18, TypeScript, Tailwind, Zustand, and Playwright stacks
- [x] T002 [P] Configure Tailwind tokens and dark theme foundations in `autohotpie-tauri/tailwind.config.cjs` and `autohotpie-tauri/postcss.config.cjs`
- [x] T003 [P] Replace placeholder entrypoint with TypeScript scaffolding in `autohotpie-tauri/src/main.tsx` and `autohotpie-tauri/src/App.tsx`
- [x] T004 Add required Rust crates (serde, tokio, tauri plugins) in `autohotpie-tauri/src-tauri/Cargo.toml`
- [x] T004d [P] Configure unit test tooling (`vitest`, `react-testing-library`) with sample suite in `autohotpie-tauri/vitest.config.ts`
- [x] T004e Set up `cargo test`/`cargo nextest` harness (workspace config, sample tests) in `autohotpie-tauri/src-tauri/`
- [x] T004a Configure GitHub Actions workflow for `npm run tauri build` on Windows/macOS/Linux в `.github/workflows/tauri-build.yml`
- [x] T004b [P] Добавить шаги генерации установщиков (NSIS `.exe`, DMG `.dmg`, AppImage/DEB/RPM) в `autohotpie-tauri/src-tauri/tauri.conf.json` и CI
- [x] T004c [P] Настроить smoke-проверку билдов (запуск `tauri info --plugin` и автоматический старт бинаря) в `.github/workflows/tauri-build.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story can be implemented.

- [x] T005 Implement versioned JSON storage layer with backups in `autohotpie-tauri/src-tauri/src/storage/mod.rs`
- [x] T006 [P] Create audit log writer with daily rotation in `autohotpie-tauri/src-tauri/src/services/audit_log.rs`
- [x] T007 [P] Define shared domain structs and validation helpers in `autohotpie-tauri/src-tauri/src/domain/` (profiles, pie menus, actions)
- [x] T008 Wire base Tauri command router and error handling in `autohotpie-tauri/src-tauri/src/main.rs` and `autohotpie-tauri/src-tauri/src/commands/mod.rs`
- [x] T009 [P] Establish global Zustand stores and system context in `autohotpie-tauri/src/state/appStore.ts` and `autohotpie-tauri/src/state/systemStore.ts`
- [x] T010 Configure Playwright harness and npm scripts in `autohotpie-tauri/tests/e2e/playwright.config.ts`
- [x] T010a [P] Implement connectivity watchdog and offline flag in `autohotpie-tauri/src-tauri/src/services/connectivity.rs`
- [x] T010b [P] Persist and hydrate offline-capable settings/profiles cache in `autohotpie-tauri/src-tauri/src/storage/mod.rs`
- [x] T010c Surface offline status banner/toast in `autohotpie-tauri/src/components/feedback/OfflineNotice.tsx`
- [x] T010d [P] Implement cross-platform active window info service (process name, window title, cursor) in `autohotpie-tauri/src-tauri/src/services/window_info.rs`
- [x] T010e Build context matcher (process/window/area rules) in `autohotpie-tauri/src-tauri/src/domain/context_rules.rs`
- [x] T010f [P] Detect fullscreen apps and expose safe-mode flag in `autohotpie-tauri/src-tauri/src/services/window_info.rs`
- [x] T010g Implement protected data-dir access check with read-only fallback in `autohotpie-tauri/src-tauri/src/services/storage_guard.rs`

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Invoke pie menu for quick actions (Priority: P1) 🎯 MVP

**Goal**: Позволить пользователю вызывать pie-меню глобальным хоткеем и запускать действия без переключения контекста.

**Independent Test**: Настроить глобальный хоткей, вызвать меню, выбрать сегмент и получить подтверждение выполнения действия.

### Tests for User Story 1

- [x] T011 [P] [US1] Author Playwright smoke test for hotkey → pie menu → action flow in `autohotpie-tauri/tests/e2e/pie-menu.spec.ts`
- [x] T011a [P] [US1] Add regression test ensuring actions execute immediately without confirmation in `autohotpie-tauri/tests/e2e/action-execution.spec.ts`

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement global hotkey registration commands in `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`
- [x] T012a [US1] Detect hotkey conflicts across Windows/macOS/Linux (Win32 Accessibility API, macOS Accessibility, X11/Wayland) with graceful fallback in `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`
- [x] T012b [US1] Surface conflict resolution dialog/toast with retry/disable options in `autohotpie-tauri/src/components/hotkeys/HotkeyConflictDialog.tsx`
- [x] T012c [US1] Select active profile by context rules before showing pie menu in `autohotpie-tauri/src-tauri/src/services/profile_router.rs`
- [x] T013 [P] [US1] Build action runner service for launches/macros in `autohotpie-tauri/src-tauri/src/services/action_runner.rs`
- [x] T013a [US1] Publish `actions://executed`/`actions://failed` events and wire frontend invoke path in `autohotpie-tauri/src-tauri/src/services/action_runner.rs` and `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts`
- [x] T014 [US1] Register hotkey and action commands within `autohotpie-tauri/src-tauri/src/main.rs`
- [x] T015 [P] [US1] Create animated pie menu renderer in `autohotpie-tauri/src/components/pie/PieMenu.tsx`
- [x] T016 [P] [US1] Implement pie menu interaction hook reacting to hotkeys in `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts`
- [x] T017 [US1] Compose overlay presentation and dark theme visuals in `autohotpie-tauri/src/App.tsx`
- [x] T018 [US1] Log action outcomes and surface toasts in `autohotpie-tauri/src/components/feedback/ActionToast.tsx` and `autohotpie-tauri/src-tauri/src/services/audit_log.rs`
- [x] T018a [US1] Show fullscreen safe-mode notification and prevent overlay when flag set in `autohotpie-tauri/src/components/pie/FullscreenNotice.tsx`
- [x] T018b [P] [US1] Implement macOS menu bar integration with pie toggle in `autohotpie-tauri/src-tauri/src/services/tray.rs` and `autohotpie-tauri/src/components/tray/MenuBarToggle.tsx`
- [x] T018c [US1] Provide Linux tray-less fallback overlay in `autohotpie-tauri/src/components/tray/LinuxFallbackPanel.tsx`

**Checkpoint**: Pie menu can be invoked and actions execute with visual confirmation.

---

## Phase 4: User Story 2 - Manage multiple automation profiles (Priority: P2)

**Goal**: Позволить создавать, редактировать и переключать профили pie-меню с визуальным редактором.

**Independent Test**: Создать профиль, настроить сегменты, переключиться на другой профиль из трея и убедиться, что хоткей открывает обновлённое меню.

### Implementation for User Story 2

- [x] T019 [P] [US2] Implement profile repository with migrations in `autohotpie-tauri/src-tauri/src/storage/profile_repository.rs`
- [x] T019a [US2] Validate profile JSON parse errors and show recovery prompt in `autohotpie-tauri/src-tauri/src/storage/profile_repository.rs`
- [x] T020 [P] [US2] Expose profile CRUD and activation commands in `autohotpie-tauri/src-tauri/src/commands/profiles.rs`
- [x] T021 [US2] Manage active profile state and selectors in `autohotpie-tauri/src/state/profileStore.ts`
  - Added `selectProfileHotkeyStatus`/`clearHotkeyStatus()` selectors, unified HotkeyConflictDialog + registration panel with new profile store events.
- [x] T021a [P] [US2] Persist per-profile hotkey bindings and conflict flags in `autohotpie-tauri/src/state/profileStore.ts`
  - Hotkey registration now updates `profileStore.lastHotkeyStatus`; UI shows profile-only conflicts with guidance.
- [x] T022 [P] [US2] Build profiles dashboard grid view in `autohotpie-tauri/src/screens/ProfilesDashboard.tsx`
- [x] T023 [P] [US2] Implement nested pie editor UI with breadcrumbs in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [x] T023a [US2] Add profile hotkey editor with validation hints in `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [x] T023b [US2] Enforce slice count/depth limits with validation and tests in `autohotpie-tauri/src-tauri/src/domain/validation.rs` & `autohotpie-tauri/src/components/profile-editor/ProfileEditor.tsx`
- [x] T024 [P] [US2] Create icon manager gallery aligned with kando style in `autohotpie-tauri/src/components/icons/IconManager.tsx`
- [x] T025 [US2] Implement action builder with macro validation in `autohotpie-tauri/src/components/actions/ActionBuilder.tsx`
- [x] T026 [US2] Wire tray switcher for profile activation in `autohotpie-tauri/src-tauri/src/services/tray.rs` and `autohotpie-tauri/src/components/tray/TrayMenu.tsx`
- [x] T026f [US2] Extend profile commands to update hotkey bindings in `autohotpie-tauri/src-tauri/src/commands/profiles.rs`
- [x] T026a [US2] Implement localization pack loader and cache in `autohotpie-tauri/src-tauri/src/services/localization.rs`
- [x] T026b [US2] Build language switcher UI and missing translation indicators in `autohotpie-tauri/src/components/localization/LanguageSwitcher.tsx`
- [x] T026c [US2] Add localization smoke test (strings render in RU/EN) in `autohotpie-tauri/tests/e2e/localization.spec.ts`
- [x] T026d [US2] Add context condition editor (process/window/region) with validation in `autohotpie-tauri/src/components/profile-editor/ContextConditionsPanel.tsx`
- [x] T026e [US2] Persist context rules per profile in `autohotpie-tauri/src-tauri/src/storage/profile_repository.rs`
- [x] T026g [US2] Implement localization schema migrations and fallback strategy in `autohotpie-tauri/src-tauri/src/services/localization.rs`

**Checkpoint**: Пользователь может управлять профилями и редактировать pie-меню без перезапуска приложения.

---

## Phase 5: User Story 3 - Configure distribution and backup (Priority: P3)

**Goal**: Обеспечить импорт/экспорт конфигураций, автозапуск и обновления для быстрого развёртывания.

**Independent Test**: Экспортировать профиль, импортировать на чистой установке, убедиться в сохранении настроек и активном автозапуске.

### Implementation for User Story 3

- [x] T127 [P] [US3] Implement import/export service with schema validation in `autohotpie-tauri/src-tauri/src/services/import_export.rs`
- [x] T128 [US3] Add Tauri commands for import/export workflows in `autohotpie-tauri/src-tauri/src/commands/import_export.rs`
- [x] T129 [P] [US3] Build settings UI for JSON import/export in `autohotpie-tauri/src/screens/SettingsImportExport.tsx`
- [x] T130 [US3] Implement cross-platform autostart toggles in `autohotpie-tauri/src-tauri/src/services/autostart.rs`
- [x] T130a [P] [US3] Построить UI-вкладку автозапуска и связать её с командами в `autohotpie-tauri/src/screens/SettingsAutostart.tsx`
- [ ] T130b [US3] Implement Linux systemd/xdg-autostart integration and fallback messaging in `autohotpie-tauri/src-tauri/src/services/autostart.rs`
  - _Deferred until macOS/Linux environments are available for FR-009/FR-022 validation._
- [ ] T130c [P] [US3] Ensure macOS menu-bar parity (icons, shortcuts, status sync) in `autohotpie-tauri/src-tauri/src/services/tray.rs` и `autohotpie-tauri/src/components/tray/MenuBarToggle.tsx`
  - _Deferred: awaiting macOS verification window to satisfy FR-022 requirements._
- [ ] T130d [P] [US3] Refine Linux tray-less fallback UX and add smoke coverage in `autohotpie-tauri/src/components/tray/LinuxFallbackPanel.tsx` и `autohotpie-tauri/tests/e2e/linux-ux.spec.ts`
  - _Deferred: pending Linux smoke-test target alignment with FR-022._
- [x] T131 [P] [US3] Port GitHub update checker logic in `autohotpie-tauri/src-tauri/src/services/update_checker.rs`
- [x] T131a [US3] Schedule periodic release polling with offline fallback and caching in `autohotpie-tauri/src-tauri/src/services/update_checker.rs`
- [x] T132 [US3] Surface update notifications in `autohotpie-tauri/src/screens/SettingsUpdates.tsx`
- [ ] T133 [P] [US3] Create log viewer panel styled like kando in `autohotpie-tauri/src/components/log/LogPanel.tsx`
- [ ] T133a [US3] Add regression tests for toasts and log-button flows (import/export, autostart) in `autohotpie-tauri/tests/e2e/notifications.spec.ts`
- [ ] T134 [US3] Add command to open latest log file in `autohotpie-tauri/src-tauri/src/commands/logs.rs`
- [ ] T134a [US3] Handle read-only data directory (prompt for alternative path/temporary storage) in `autohotpie-tauri/src-tauri/src/services/storage_guard.rs`
- [ ] T134b [US3] Add regression tests for import/export failure scenarios in `autohotpie-tauri/tests/e2e/import-export-negative.spec.ts`
- [ ] T134c [US3] Verify backup retention (5 generations) via integration test in `autohotpie-tauri/src-tauri/tests/integration/profile_backups.rs`

**Checkpoint**: Конфигурации мигрируются между машинами, автозапуск работает, обновления и логи доступны из UI.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final refinements impacting multiple stories.

- [ ] T035 Review and update `specs/001-build-tauri-pie/quickstart.md` after end-to-end validation
- [ ] T037 [P] Tune pie menu performance and memory usage in `autohotpie-tauri/src/components/pie/PieMenu.tsx` and `autohotpie-tauri/src-tauri/src/services/action_runner.rs`
- [ ] T037 Execute accessibility & localization sweep plus cross-platform smoke run via `autohotpie-tauri/tests/e2e/`
- [ ] T037a [P] Benchmark hotkey → action latency and memory footprint per NFRs in `autohotpie-tauri/tests/perf/latency.spec.ts`
- [ ] T037b [P] Add localization fallback regression tests (missing strings, schema mismatches) in `autohotpie-tauri/tests/e2e/localization-negative.spec.ts`
- [ ] T037c [P] Instrument FPS measurement for pie menu rendering to confirm compliance with `NFR-003` in `autohotpie-tauri/tests/perf/fps.spec.ts`
- [ ] T037d План и сбор метрик удовлетворённости UX (≥4/5) с фиксацией результатов в `specs/001-build-tauri-pie/research.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completion — blocks all user stories.
- **User Story Phases (3–5)**: Depend on Phase 2 completion; then proceed in priority order (US1 → US2 → US3) or in parallel if capacity allows.
- **Polish (Phase 6)**: Depends on desired user story phases being complete.

### User Story Dependencies
- **US1 (P1)**: Independent once foundational tasks complete.
- **US2 (P2)**: Depends on shared storage/commands from foundational and US1 command wiring; otherwise independent.
- **US3 (P3)**: Depends on storage/logging infrastructure from foundational and profile data from US2.

### Within Each User Story
- Execute tests (if included) before implementation tasks.
- Build backend services/commands before frontend integrations.
- Ensure logging and telemetry hooks finalize before polish.

## Parallel Execution Examples
- During Phase 1, T002–T004 can run alongside T001 after dependency installation.
- In Phase 3, T012, T013, T015, and T016 can proceed concurrently once command scaffolding (T008) is in place.
- Phase 4 UI tasks (T022–T025) can run parallel after repositories (T019, T020) land.
- Phase 5 services T027, T030, T031 can progress in parallel while frontend counterparts (T029, T032, T033) are developed.

## Implementation Strategy

### MVP First (User Story 1)
1. Complete Phases 1–2 (setup + foundational infrastructure).
2. Deliver Phase 3 (US1) to achieve functional pie menu with action execution.
3. Validate via Playwright smoke test (T011) and manual acceptance.

### Incremental Delivery
1. Ship MVP (US1) → demo.
2. Add US2 to unlock profile management → demo.
3. Add US3 for distribution/autostart/update features → demo.
4. Finish with Phase 6 polish for performance, accessibility, and documentation.

### Team Parallelization
- After Phase 2, assign separate developers to US1, US2, and US3 while coordinating on shared modules.
- QA/Testing can operate in parallel using Playwright suites once foundational scripts (T010) exist.
