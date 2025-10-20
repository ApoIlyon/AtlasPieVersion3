# Research: Context-Aware Pie Menu Trigger

## Decisions

### Decision 1: Maintain `Ctrl+Alt+Space` as the unified global hotkey with conflict fallback
- **Decision**: Keep `Ctrl+Alt+Space` as the default accelerator and reuse the conflict registry and dialog introduced in `T012a` to surface clashes before showing the pie menu.
- **Rationale**: Users already encounter this shortcut in documentation, and the conflict registry guarantees parity across Windows Accessibility, macOS Accessibility, and X11/Wayland APIs. Delegating to the existing dialog avoids fragmenting UX.
- **Alternatives considered**: (1) Per-profile hotkeys for invocation — rejected to prevent user confusion and drift from tasks.md scope. (2) Dynamic remapping on conflict — rejected because users must explicitly acknowledge replacements for accessibility compliance.

### Decision 2: Profile selection precedence pipeline inside `profile_router`
- **Decision**: Evaluate active window metadata through the context matcher, scoring matches by rule specificity, explicit priority, and last-used timestamp to yield a single `ActiveProfile`.
- **Rationale**: Deterministic ranking keeps overlays predictable and aligns with audit requirements. Reusing `context_rules.rs` reduces new surface area.
- **Alternatives considered**: (1) Frontend-driven selection — rejected because window metadata is only accessible in Rust. (2) Randomized tie-breakers — rejected since repeatability is necessary for debugging and support.

### Decision 3: ActionRunner executes actions synchronously with async offloading and emits structured events
- **Decision**: Wrap action execution in `ActionRunner::execute(action_id, context)` returning immediately while emitting `actions://executed` or `actions://failed` via Tauri event emitter after completion.
- **Rationale**: Keeps the hotkey → menu flow responsive, leverages Tauri's async runtime, and gives UI hooks a single subscription path.
- **Alternatives considered**: (1) Blocking invoke response with result payload — rejected because long-running scripts would freeze the overlay. (2) Polling status store — rejected for added complexity and slower feedback.

### Decision 4: UI toasts sourced from `usePieMenuHotkey` hook with optimistic overlay dismissal
- **Decision**: Subscribe to action events inside `usePieMenuHotkey.ts`, close the overlay after selection, and trigger dedicated success/error toasts.
- **Rationale**: Concentrating state updates in the hotkey hook matches existing architecture (centralized store dispatch) and avoids tight coupling between `PieMenu.tsx` and toast components.
- **Alternatives considered**: (1) Dispatching Redux-like actions globally — unnecessary because Zustand already powers stores. (2) Embedding banners in the pie menu — rejected for visual clutter and accessibility concerns.

### Decision 5: Audit logging expansion for action outcomes
- **Decision**: Extend `audit_log.rs` to accept `ActionOutcomeEvent` entries for both success and failure, written within one second of event emission.
- **Rationale**: Supports success criteria (support review within 10 seconds) and leverages existing rotating log infrastructure.
- **Alternatives considered**: (1) Separate action-history file — rejected to avoid duplicate retention logic. (2) Frontend-only logging — rejected because logs must persist across sessions.
