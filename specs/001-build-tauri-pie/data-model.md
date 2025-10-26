# Data Model: AutoHotPie Tauri Native Suite

## Entities

### Profile
- **Fields**: `id (Uuid)`, `name`, `isActive`, `hotkey (HotkeyBindingId)`, `context (ContextRuleSetId)`, `rootMenuId (PieMenuId)`, `version (u32)`, `createdAt`, `updatedAt`
- **Relationships**: owns one root `PieMenu`; references `HotkeyBinding`, `ContextRuleSet`
- **Constraints**: unique hotkey per active profile; max 50 profiles; version increments on schema change
- **Lifecycle**: created from template or blank → edited (menus/actions) → activated/deactivated → migrated on load if version mismatch

### PieMenu
- **Fields**: `id (PieMenuId)`, `profileId`, `title`, `appearance (PieAppearance)`, `sliceIds[]`, `maxDepth`
- **Relationships**: owned by one `Profile`; composed of `PieSlice` entries
- **Constraints**: `sliceIds` length 2–12; depth ≤ 3; appearance tokens drive theming

### PieSlice
- **Fields**: `id (PieSliceId)`, `pieMenuId`, `order`, `label`, `iconId (IconAssetId)`, `actionId`, `childMenuId? (PieMenuId)`, `hotkey? (HotkeyBindingId)`, `description?`
- **Relationships**: references `Action`, optional `IconAsset`, optional child `PieMenu`
- **Constraints**: `order` unique per parent menu; either `actionId` or `childMenuId` required; optional hotkey validated per profile scope

### Action
- **Fields**: `id (ActionId)`, `kind (launch|macro|sequence|system)`, `payload (ActionPayload)`, `macroStepIds[]`, `timeoutMs`, `lastValidatedAt`, `lastRunAt`, `runCount`
- **Relationships**: referenced by `PieSlice`; may own `MacroStep` records
- **Constraints**: payload schema validated per kind; macro steps limited ≤ 20; timeout default 3000 ms
- **Lifecycle**: defined → validated → executed (audit logged) → migrated if payload schema changes

### MacroStep
- **Fields**: `id`, `actionId`, `order`, `kind (key|text|delay|script)`, `payload`, `duration`
- **Relationships**: belongs to `Action`
- **Constraints**: `order` unique per action; delay ≤ 5000 ms; script payload sanitized

### HotkeyBinding
- **Fields**: `id`, `scope (profile|global)`, `accelerator`, `platform`, `isEnabled`, `conflictWith?` , `registeredAt`
- **Constraints**: no duplicates per platform; store conflicting binding ids for recovery prompts
- **Lifecycle**: requested → validated (system API) → registered → auto-retry or disabled on conflict

### SettingsBundle
- **Fields**: `id`, `language`, `autostart`, `trayMode`, `themeVariant`, `telemetryLevel`, `dataDir`, `updateChannel`
- **Constraints**: `telemetryLevel` fixed to `local-only`; `dataDir` must be writable; `updateChannel` default `stable`

### IconAsset
- **Fields**: `id`, `source (builtin|user)`, `path`, `size`, `format`, `createdAt`, `checksum`, `license`
- **Constraints**: size ≤ 256 KB; formats svg/png only; checksum deduplicates assets
- **Lifecycle**: import → optimize → assign to slices/profiles → prune when unused

### LocalizationPack
- **Fields**: `id`, `language`, `version`, `strings JSON`, `missingKeys[]`, `fallbackOf?`
- **Constraints**: semantic versioning; JSON validated against schema; fallback chain enforced when keys missing

### PreviewState
- **Fields**: `profileId`, `layoutCache`, `thumbnailPath`, `lastRenderedAt`
- **Purpose**: accelerates editor preview rendering and dashboard thumbnails
- **Constraints**: cache invalidated when pie menu changes; thumbnails stored under user cache dir

### AuditLogEntry
- **Fields**: `id`, `timestamp`, `level (info|warn|error)`, `component`, `message`, `context JSON`
- **Relationships**: references optional `profileId`/`actionId`
- **Constraints**: immutable append-only; rotated daily с retention ≤ 50 MB; UI exposes latest file via Log button

## Data Flows
- Profiles reference pie menus and slices; slices bind to actions/macros and optional child menus.
- Actions with type `sequence` reference ordered `MacroStep` records; executed via Rust command runner.
- Settings bundle controls global behavior (language, autostart, update checks) and persists separately from profiles.
- Icon assets and localization packs stored in dedicated folders, referenced by ID in profiles/actions.
- Audit logs written to local files; button `Log` opens latest file; entries also surfaced in UI console with filtering.

## Persistence & Migration
- All entities stored as versioned JSON documents with schema version (e.g., `profiles.v1.json`).
- Migrations run on startup via Rust `storage` module: detect version mismatch → apply transform → backup previous data.
- Backups kept in `backups/YYYYMMDD/` per profile/settings prior to migration; retention configurable (default 5).

## Validation Rules
- On save/import, JSON validated against JSON Schema (contracts folder) before writing to disk.
- Hotkey registrations verified via platform APIs; conflicts produce actionable errors.
- Macro steps sanitized to avoid privileged commands unless user opts-in (future expansion).
