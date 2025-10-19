# Feature Specification: Context-Aware Pie Menu Trigger

**Feature Branch**: `002-context-pie-menu`  
**Created**: 2025-10-19  
**Status**: Draft  
**Input**: User description: "В общем я выполнял задачу по этапна в tasks.md но в моменте T012c-T013a остановился так как нужно реализовать контекстное pie-меню: глобальный хоткей Ctrl+Alt+Space доступен на Windows/macOS/Linux; перед показом меню выбираем профиль по процессу/заголовку окна; сегменты запускают скрипты/приложения через будущий ActionRunner; регистрация конфликтов как в T012a; нужно события об успехе/ошибке для UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invoke context pie menu (Priority: P1)

Power user presses the global hotkey to surface a pie menu that already reflects the profile matching the active window and application.

**Why this priority**: Enables the primary value proposition—launching contextual automations without switching workflows.

**Independent Test**: Trigger the hotkey on each supported OS, verify the correct profile loads, and confirm the pie menu opens without fallback dialogs.

**Acceptance Scenarios**:

1. **Given** the user has configured profiles with context rules, **When** they press `Ctrl+Alt+Space` while a matching application is focused, **Then** the menu opens with the matching profile segments highlighted.
2. **Given** no profiles match the active window, **When** the user presses the global hotkey, **Then** the menu opens with the default profile and a silent audit entry records the fallback.

---

### User Story 2 - Receive action feedback (Priority: P2)

Power user wants immediate confirmation that the launched action succeeded or failed after selecting a menu segment.

**Why this priority**: Reinforces trust in automation flows and highlights recoverable errors without reviewing logs.

**Independent Test**: Select representative segments for scripts and app launches, observe success toast on completion, induce a failure, and verify the error notification and audit entry.

**Acceptance Scenarios**:

1. **Given** an action completes successfully, **When** the user selects its segment, **Then** a success toast appears and the overlay dismisses.
2. **Given** an action fails to launch, **When** the user selects its segment, **Then** an error notification surfaces with retry guidance and the failure is logged.

---

### User Story 3 - Handle hotkey conflicts gracefully (Priority: P3)

Power user needs assurance that the global hotkey remains available or that the app surfaces a conflict resolution flow before attempting to show the menu.

**Why this priority**: Prevents invisible failures caused by OS-level conflicts and keeps the pie menu invocation predictable.

**Independent Test**: Reproduce a hotkey conflict on each platform, confirm the system detects it, surfaces the conflict UI, and blocks menu display until the user resolves or acknowledges it.

**Acceptance Scenarios**:

1. **Given** the hotkey registration fails due to OS conflict, **When** the user attempts to trigger the menu, **Then** the UI shows the existing conflict dialog with options to retry or change the shortcut.
2. **Given** the conflict is resolved, **When** the user retries registration, **Then** the system clears the conflict state and the menu opens on the next hotkey press.

### Edge Cases

- Hotkey is triggered while the active window information service is temporarily unavailable.
- Multiple profiles match the same window title and process simultaneously.
- Action execution takes longer than the configured timeout or exits with a non-zero code.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST register `Ctrl+Alt+Space` as a cross-platform global hotkey during startup and keep the registration status synchronized with the hotkey conflict registry from `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`.
- **FR-002**: System MUST, upon hotkey press, request active window metadata and evaluate context rules in `autohotpie-tauri/src-tauri/src/services/profile_router.rs` to select a single active profile prior to rendering the menu.
- **FR-003**: System MUST enforce deterministic profile selection precedence (rule specificity > explicit priority > most recently used) and record the chosen profile for audit purposes.
- **FR-004**: System MUST fall back to the default profile when no context rules match and log the fallback without interrupting menu rendering.
- **FR-005**: System MUST block pie menu display and trigger the conflict dialog in `autohotpie-tauri/src/components/hotkeys/HotkeyConflictDialog.tsx` whenever the conflict registry flags the global hotkey as unavailable.
- **FR-006**: System MUST render pie menu segments from the selected profile and highlight disabled actions with explanatory tooltips when prerequisites are unmet.
- **FR-007**: Selecting a segment MUST invoke the ActionRunner service in `autohotpie-tauri/src-tauri/src/services/action_runner.rs` with the action payload (script, application, parameters, working directory, and environment overrides).
- **FR-008**: ActionRunner MUST emit an `actions://executed` event on successful completion including action identifier, duration, and resulting metadata for UI consumption.
- **FR-009**: ActionRunner MUST emit an `actions://failed` event on execution failure including error category, user-facing message, and retry eligibility.
- **FR-010**: Frontend hooks in `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts` MUST subscribe to both events, update UI state, and surface toasts in `autohotpie-tauri/src/components/feedback/ActionToast.tsx` or equivalent error overlays.
- **FR-011**: System MUST persist execution outcomes (success and failure) in the audit log via `autohotpie-tauri/src-tauri/src/services/audit_log.rs` within one second of event emission.
- **FR-012**: ActionRunner MUST serialize pie menu actions—each invocation waits for the previous execution to complete before starting—to match legacy AutoHotPie and Kando behavior.

### Key Entities *(include if feature involves data)*

- **ActiveProfile**: Selected profile instance containing resolved ID, name, default segments, and evaluation metadata.
- **ContextRuleMatch**: Result of evaluating a context rule, including specificity score, matched window attributes, and priority index.
- **PieSegmentAction**: Immutable descriptor of the action linked to a pie segment, including execution type, parameters, and UI affordances.
- **ActionEventPayload**: Data broadcast with success or failure events, including action reference, timestamp, result state, and optional diagnostic message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of hotkey presses display the pie menu with the correct profile in under 0.5 seconds on all supported platforms during acceptance testing.
- **SC-002**: 100% of detected hotkey conflicts trigger the conflict dialog before any menu attempt in release candidate builds.
- **SC-003**: 90% of successful action executions produce a user-visible confirmation within 1 second, based on manual test scripts.
- **SC-004**: 100% of action executions (success or failure) create corresponding audit log entries that can be retrieved within 10 seconds for support review.

## Clarifications

### Session 2025-10-19

- Q: Should ActionRunner execute pie menu actions sequentially or allow parallel runs? → A: Execute sequentially (new action waits for previous completion).
