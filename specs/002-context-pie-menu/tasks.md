# Tasks: Context-Aware Pie Menu Trigger

**Input**: Design documents from `/specs/002-context-pie-menu/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: Execute Rust (`cargo nextest`), TypeScript (`vitest`), and Playwright end-to-end suites per quickstart guidance.

**Organization**: Tasks are grouped by user story so each slice can be shipped and tested independently.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Task can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story tag (US1, US2, US3) for feature slices
- Include exact file paths in every description

## Path Conventions
- Frontend: `autohotpie-tauri/src/`
- Backend (Tauri/Rust): `autohotpie-tauri/src-tauri/src/`
- Tests & scripts: `autohotpie-tauri/tests/`, `autohotpie-tauri/tests/e2e/`, `autohotpie-tauri/tests/perf/`

---

## Phase 1: Setup (Shared Infrastructure)

**Goal**: Prepare shared fixtures and config required by all stories.

**Independent Test**: Playwright suite can load contextual fixtures without manual tweaks.

### Implementation for Setup

- [ ] T001 [P] Create contextual profile fixture for tests in `autohotpie-tauri/tests/e2e/fixtures/context-profiles.json`
- [ ] T002 [P] Load contextual fixture via `autohotpie-tauri/tests/e2e/playwright.config.ts` projects setup

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal**: Establish domain models and cross-cutting event plumbing that all stories rely on.

**Independent Test**: Backend can compile with new structs, and action event channel is registered before story work.

### Implementation for Foundational

- [ ] T003 Define `ActiveProfile`, `ContextRuleMatch`, and `ActionEventPayload` structures in `autohotpie-tauri/src-tauri/src/domain/mod.rs`
- [ ] T004 Extend audit logging pipeline for action outcomes in `autohotpie-tauri/src-tauri/src/services/audit_log.rs`
- [ ] T005 Register action outcome event channel and command wiring in `autohotpie-tauri/src-tauri/src/main.rs` and `autohotpie-tauri/src-tauri/src/commands/mod.rs`
- [ ] T006 Introduce shared TypeScript typings for action events in `autohotpie-tauri/src/types/actionEvents.ts`

---

## Phase 3: User Story 1 - Invoke context pie menu (Priority: P1)

**Goal**: Hotkey invocation loads the correct profile based on active window context and renders its segments.

**Independent Test**: Triggering `Ctrl+Alt+Space` in different apps shows the matching profile or the default fallback.

### Tests for User Story 1

- [ ] T007 [P] [US1] Add Rust unit tests covering profile selection precedence in `autohotpie-tauri/src-tauri/src/services/profile_router.rs`
- [ ] T008 [P] [US1] Update Playwright flow in `autohotpie-tauri/tests/e2e/pie-menu.spec.ts` to assert profile-specific menu rendering

### Implementation for User Story 1

- [ ] T009 [US1] Implement deterministic context evaluation and fallback logging in `autohotpie-tauri/src-tauri/src/services/profile_router.rs`
- [ ] T010 [US1] Expose active profile resolution command in `autohotpie-tauri/src-tauri/src/commands/mod.rs`
- [ ] T011 [US1] Request active profile before menu render within `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts`
- [ ] T012 [US1] Render matched profile segments and disabled states in `autohotpie-tauri/src/components/pie/PieMenu.tsx`
- [ ] T013 [US1] Reset overlay/menu state on fallback scenarios in `autohotpie-tauri/src/App.tsx`

---

## Phase 4: User Story 2 - Receive action feedback (Priority: P2)

**Goal**: Selecting a segment emits success/failure events, dismisses the menu, shows toasts, and logs outcomes.

**Independent Test**: Successful and failing actions surface corresponding toasts and appear in audit logs without blocking the UI.

### Tests for User Story 2

- [ ] T014 [P] [US2] Cover sequential queue and payload emission with Rust tests in `autohotpie-tauri/src-tauri/src/services/action_runner.rs`
- [ ] T015 [P] [US2] Add vitest coverage for event subscription logic in `autohotpie-tauri/src/hooks/__tests__/usePieMenuHotkey.test.ts`
- [ ] T016 [P] [US2] Extend Playwright scenario in `autohotpie-tauri/tests/e2e/action-execution.spec.ts` to verify success/error toasts

### Implementation for User Story 2

- [ ] T017 [US2] Enforce sequential execution and emit structured events in `autohotpie-tauri/src-tauri/src/services/action_runner.rs`
- [ ] T018 [US2] Dispatch `actions://executed` and `actions://failed` via `autohotpie-tauri/src-tauri/src/main.rs`
- [ ] T019 [US2] Subscribe to action events and manage overlay lifecycle in `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts`
- [ ] T020 [US2] Surface success/error toasts and retry hints in `autohotpie-tauri/src/components/feedback/ActionToast.tsx`
- [ ] T021 [US2] Persist action outcome entries with metadata in `autohotpie-tauri/src-tauri/src/services/audit_log.rs`

---

## Phase 5: User Story 3 - Handle hotkey conflicts gracefully (Priority: P3)

**Goal**: Conflict detection prevents the menu from opening and routes the user through the existing resolution dialog.

**Independent Test**: Simulated OS conflict keeps the menu closed until the user resolves it, then normal invocation resumes.

### Tests for User Story 3

- [ ] T022 [P] [US3] Author Playwright regression `autohotpie-tauri/tests/e2e/hotkey-conflict.spec.ts` for conflict gating
- [ ] T023 [P] [US3] Add dialog gating unit tests in `autohotpie-tauri/src/components/hotkeys/__tests__/HotkeyConflictDialog.test.tsx`

### Implementation for User Story 3

- [ ] T024 [US3] Extend conflict telemetry and responses in `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`
- [ ] T025 [US3] Track conflict state for overlays in `autohotpie-tauri/src/state/systemStore.ts`
- [ ] T026 [US3] Block pie menu invocation when conflicts are active inside `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts`
- [ ] T027 [US3] Surface retry/disable options with updated copy in `autohotpie-tauri/src/components/hotkeys/HotkeyConflictDialog.tsx`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Goal**: Final tuning for observability, documentation, and performance guarantees.

**Independent Test**: Logs, docs, and scripts reflect the finalized behavior; latency checks meet targets.

### Implementation for Polish

- [ ] T028 [P] Capture last action outcome metrics in `autohotpie-tauri/src/state/appStore.ts`
- [ ] T029 [P] Document toast troubleshooting and regression commands in `specs/002-context-pie-menu/quickstart.md`
- [ ] T030 [P] Add latency assertion for sequential runner in `autohotpie-tauri/tests/perf/latency.spec.ts`
- [ ] T031 Update npm script bundle (`test:pie`) covering new suites in `autohotpie-tauri/package.json`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies — prepares fixtures for later tests.
- **Foundational (Phase 2)**: Depends on Phase 1 (fixture paths referenced in upcoming tests).
- **User Stories (Phases 3–5)**: Depend on Foundational; execute in priority order (US1 → US2 → US3) for incremental value.
- **Polish (Phase 6)**: Requires completion of all user stories.

### User Story Dependencies
- **US1 (P1)**: Independent once foundational event plumbing is ready.
- **US2 (P2)**: Depends on US1 hook/menu updates and action runner scaffolding.
- **US3 (P3)**: Depends on US1 hotkey integration and US2 event/state handling.

### Within Each User Story
- Implement or update tests (Rust/vitest/Playwright) before feature code where feasible.
- Backend service changes precede frontend hooks and UI updates.
- Finalize logging/audit updates before polish tasks.

### Parallel Execution Examples
- After Phase 1, T003–T006 can proceed in order while frontend typings (T006) may run alongside audit updates once structs exist.
- During US1, T007 and T008 can be authored concurrently before implementation tasks land.
- For US2, vitest (T015) and Playwright (T016) work can progress while backend sequential queue (T017) is under review.
- Polish tasks T028–T030 may run in parallel once US3 is merged.

---

## Implementation Strategy

1. Deliver US1 to achieve contextual menu invocation and fallback logging.
2. Layer US2 for action events, sequential execution, and UI toasts.
3. Complete US3 to guard against hotkey conflicts prior to release.
4. Finish polish tasks to align telemetry, documentation, and performance targets before handoff.
