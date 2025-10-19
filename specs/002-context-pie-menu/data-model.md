# Data Model: Context-Aware Pie Menu Trigger

## Entities

### ActiveProfile
- **Fields**: `profileId (Uuid)`, `name`, `matchedRuleId? (Uuid)`, `selectorScore (f32)`, `selectedAt (DateTime)`
- **Relationships**: References `Profile` stored in `storage/profile_repository.rs`
- **Constraints**: `selectorScore` derived from context rule specificity/priority; only one `ActiveProfile` may be flagged at a time
- **Lifecycle**: Computed on hotkey press → cached during overlay lifetime → cleared when overlay closes or focus changes

### ContextRuleMatch
- **Fields**: `ruleId (Uuid)`, `processName`, `windowTitlePattern`, `score (f32)`, `priority (u8)`, `lastMatchedAt (DateTime)`
- **Relationships**: belongs to a `Profile`
- **Constraints**: `score` must be deterministic for same input; ties resolved by `priority`, then `lastMatchedAt`
- **Lifecycle**: Evaluated on-demand via `context_rules.rs`; persisted to audit log for traceability

### HotkeyRegistrationState
- **Fields**: `accelerator (String)`, `platform (Enum)`, `status (registered|conflict|error)`, `conflictReason? (String)`, `checkedAt (DateTime)`
- **Relationships**: Shares identifiers with existing conflict registry in `commands/hotkeys.rs`
- **Constraints**: Must be refreshed on startup and when OS signals changes
- **Lifecycle**: Initialized during app boot → updated when registration changes → read by frontend for toast/dialog

### PieMenuInvocation
- **Fields**: `invocationId (Uuid)`, `requestedAt (DateTime)`, `activeProfileId (Uuid)`, `overlayShownAt? (DateTime)`, `fallbackApplied (bool)`
- **Relationships**: Links to `ActiveProfile`, `AuditLogEntry`
- **Constraints**: `overlayShownAt - requestedAt` must remain < 500 ms (tracked via telemetry logs)
- **Lifecycle**: Created on hotkey press → updated when overlay renders → closed when action chosen or overlay dismissed

### PieSegmentAction
- **Fields**: `actionId (Uuid)`, `segmentId (Uuid)`, `label`, `type (launch|script|macro|system)`, `payload (JSON)`
- **Relationships**: references `Action` entity defined in base suite; reused here for execution context
- **Constraints**: `payload` validated before ActionRunner dispatch; segments referencing disabled actions flagged to UI
- **Lifecycle**: Loaded with active profile → executed via ActionRunner → audit logged with outcome

### ActionOutcomeEvent
- **Fields**: `eventId (Uuid)`, `actionId (Uuid)`, `invocationId (Uuid)`, `status (executed|failed)`, `durationMs (u32)`, `message`, `timestamp (DateTime)`
- **Relationships**: Broadcast through Tauri event emitter to frontend; persisted in audit log
- **Constraints**: `durationMs` must be captured even on failures; `message` limited to 512 characters for toast display
- **Lifecycle**: Emitted by ActionRunner → consumed by frontend hook → written to audit log → used for support diagnostics

## Data Flows
- Hotkey press triggers `profile_router` to evaluate context rules, yielding `ActiveProfile` and `PieMenuInvocation` metadata.
- Pie menu renders segments from the chosen profile; disabled actions show tooltip reasons.
- Selecting a segment dispatches `PieSegmentAction` to ActionRunner; upon completion, an `ActionOutcomeEvent` is emitted and appended to audit logs.
- Hotkey conflicts detected during registration update `HotkeyRegistrationState` and surface UI dialogs before invocation resumes.

## Persistence & Migration
- No new persistent collections introduced; leverage existing JSON storage for profiles and audit logs.
- `ActionOutcomeEvent` appends to existing audit log schema via new `component = "action_runner"` entries.
- `profile_router` caches may be stored in memory only; no disk migrations required.

## Validation Rules
- Context rule evaluation must confirm both process name and window title patterns before claiming a match.
- Default profile fallback occurs only when `ContextRuleMatch` list is empty; audit log records `fallbackApplied = true`.
- ActionRunner validates executable paths/scripts before launch; failures emit structured errors for UI and logs.
