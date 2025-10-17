# Data Model: AutoHotPie Tauri Native Suite

## Entities

### Profile
- **Fields**: `id (UUID)`, `name`, `description`, `hotkey`, `isActive`, `createdAt`, `updatedAt`, `pieMenuId`, `iconId`, `tags[]`
- **Relationships**: belongs to `PieMenu`; references `HotkeyBinding`; optional icon via `IconAsset`
- **Constraints**: unique `hotkey` per active profile; at least one profile marked active; max 50 profiles
- **Lifecycle**: created from template or blank → edited (pie structure/actions) → activated/deactivated → archived (soft delete)

### PieMenu
- **Fields**: `id`, `profileId`, `name`, `layoutVersion`, `segments[]`, `maxDepth`, `themeToken`, `animationPreset`
- **Relationships**: owned by one `Profile`; composed of `PieSlice` items
- **Constraints**: `segments` length 2–12; depth ≤ 3; layout version drives rendering migrations

### PieSlice
- **Fields**: `id`, `pieMenuId`, `order`, `label`, `description`, `iconId`, `actionId`, `hotkey`, `childPieMenuId`, `colorToken`
- **Relationships**: references `Action`, optional `IconAsset`, optional child `PieMenu`
- **Constraints**: `order` unique within menu level; either `actionId` or `childPieMenuId` required; hotkey optional but validated against conflicts

### Action
- **Fields**: `id`, `type (launch|macro|sequence|system)`, `parameters JSON`, `timeoutMs`, `requiresConfirmation`, `lastRunAt`, `runCount`
- **Relationships**: referenced by `PieSlice`
- **Constraints**: schema of `parameters` validated per type; `timeoutMs` default 3000; sequences limited ≤ 20 steps
- **Lifecycle**: defined → validated → executed (log result) → updated or removed

### MacroStep
- **Fields**: `id`, `actionId`, `order`, `kind (key|text|delay|script)`, `payload`, `duration`
- **Relationships**: belongs to `Action`
- **Constraints**: `order` unique per action; delay ≤ 5000 ms; script payload sanitized

### HotkeyBinding
- **Fields**: `id`, `scope (profile|global)`, `binding`, `platform`, `isEnabled`, `conflictWith`
- **Constraints**: no duplicates per platform; conflict detection recorded in `conflictWith`
- **Lifecycle**: requested → validated (system API) → registered → unregistered

### SettingsBundle
- **Fields**: `id`, `language`, `autostart`, `trayMode`, `themeVariant`, `telemetryLevel`, `dataDir`, `updateChannel`
- **Constraints**: `telemetryLevel` fixed to `local-only`; `dataDir` must be writable; `updateChannel` default `stable`

### IconAsset
- **Fields**: `id`, `source (builtin|user)`, `path`, `size`, `format`, `createdAt`, `checksum`, `license`
- **Constraints**: size ≤ 256 KB; formats svg/png only; checksum deduplicates assets
- **Lifecycle**: import → optimize → assign to slices/profiles → prune when unused

### LocalizationPack
- **Fields**: `id`, `language`, `version`, `strings JSON`, `missingKeys[]`
- **Constraints**: version semantic; JSON validated against schema; missing keys drive UI badge

### PreviewState
- **Fields**: `profileId`, `layoutCache`, `thumbnailPath`, `lastRenderedAt`
- **Purpose**: accelerates editor preview rendering and dashboard thumbnails
- **Constraints**: cache invalidated when pie menu changes; thumbnails stored under user cache dir

### AuditLogEntry
- **Fields**: `id`, `timestamp`, `level (info|warn|error)`, `component`, `message`, `context JSON`
- **Relationships**: references optional `profileId`/`actionId`
- **Constraints**: immutable append-only; rotated daily with max 50 MB retained

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
