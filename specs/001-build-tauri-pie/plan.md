# Implementation Plan: AutoHotPie Tauri Native Suite

**Branch**: `[001-build-tauri-pie]` | **Date**: 2025-10-17 | **Spec**: `specs/001-build-tauri-pie/spec.md`
**Input**: Feature specification from `/specs/001-build-tauri-pie/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Построить кроссплатформенное Tauri‑приложение, повторяющее UX AutoHotPie и `kando-2.0.0`: визуальный редактор pie-меню, управление профилями, глобальные хоткеи и запуск действий без AutoHotkey. Backend на Rust реализует команды (работа с профилями, макросами, действиями, хранилищем JSON и хоткеями), фронтенд на TypeScript/React рендерит тёмный UI с предпросмотром меню, менеджером иконок, локальными логами и GitHub-проверкой обновлений.

## Technical Context

**Language/Version**: Rust 1.75+ (Tauri backend commands), Node.js 18 + TypeScript/React 18 (frontend)  
**Primary Dependencies**: Tauri 1.x, @tauri-apps/plugin-global-shortcut, @tauri-apps/plugin-store, React 18, Zustand/Recoil, Tailwind CSS + Radix UI, Serde/Tokio, crossbeam, OS-specific API через Tauri  
**Storage**: JSON файлы в пользовательском каталоге (`%APPDATA%`, `~/Library/Application Support`, `~/.config`) с модулем миграций и резервного копирования  
**Testing**: `cargo test` + `cargo nextest` для Rust, `vitest`/`react-testing-library` для UI, Playwright smoke e2e на `windows-latest`/`ubuntu-latest` для каждого PR + ночной `macos-latest` прогон  
**Target Platform**: Windows 10/11 x64, macOS 13+ (Intel/Apple Silicon), Linux (Ubuntu 22.04+, Fedora 38+, KDE Neon)  
**Project Type**: Desktop (Tauri: общий фронтенд + нативный backend на Rust)  
**Performance Goals**: Вызов pie-меню < 50 мс, запуск действия < 200 мс, UI > 60 FPS, потребление памяти < 150 МБ при 3 активных профилях  
**Constraints**: Полностью оффлайн, без внешней телеметрии, работа из трея, совместимость с глобальными хоткеями на всех ОС, dark theme UI, GitHub update-checker (проверка релизов), обязательная поддержка автозапуска Windows/macOS/Linux  
**Scale/Scope**: До 50 профилей, до 12 сегментов и 3 вложенных уровней, JSON импорт/экспорт до 5 МБ, одиночные пользователи/команды power-users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Observation**: `.specify/memory/constitution.md` содержит placeholders без конкретных принципов → дополнительных ограничений нет.  
- **Gate Status**: PASS — план не нарушает существующих требований; при появлении реальных принципов потребуется пересмотр.

## Project Structure

### Documentation (this feature)

```
specs/001-build-tauri-pie/
├── plan.md              # текущий документ
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 (OpenAPI/JSON Schema команд)
└── tasks.md             # генерируется /speckit.tasks
```

### Source Code (repository root)
Ниже зафиксирована актуальная структура репозитория для фичи.

```
autohotpie-tauri/
├── src/                     # React/TypeScript UI
│   ├── components/
│   ├── screens/
│   ├── state/
│   ├── hooks/
│   ├── services/            # обёртки Tauri invoke
│   └── index.tsx/main.tsx
├── public/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/
└── package.json

autohotpie-tauri/src-tauri/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── commands/
│   ├── domain/
│   ├── services/
│   ├── storage/
│   ├── integrations/
│   ├── telemetry/
│   └── utils/
├── resources/
└── tests/
    ├── unit/
    └── integration/

autohotpie-tauri/contracts/
└── openapi.yaml (Phase 1)
```

**Structure Decision**: Используем монорепозиторий `autohotpie-tauri/`: фронтенд в `src/`, Rust backend в `src-tauri/src/` с разделением по слоям. Tests и scripts выстроены по уровням; контракты живут рядом для синхронизации с документацией.

## ActionDefinition Payload Contract

- **Command scope**: `list_profiles`, `save_profile`, последующие CRUD-команды возвращают/принимают `ProfileStore` целиком.
- **ProfileStore JSON**:
  - `schemaVersion: number`
  - `profiles: ProfileRecord[]`
  - `activeProfileId?: string | null`
  - `migratedFromSettings?: string | null`
- **ProfileRecord JSON**:
  - `profile`: базовые поля (`id`, `name`, `enabled`, `globalHotkey`, `activationRules[]`, `rootMenu`)
  - `menus[]`: без изменений
  - `actions[]: ActionDefinition[]`
  - `createdAt?: string | null`, `updatedAt?: string | null`
- **ActionDefinition** (frontend/backend shared):

```jsonc
{
  "id": "action-launch-calculator",
  "name": "Launch Calculator",
  "description": null,
  "kind": "macro",
  "timeoutMs": 3000,
  "lastValidatedAt": "2025-10-18T17:42:10Z",
  "steps": [
    {
      "id": "step-1",
      "order": 0,
      "kind": "launch",
      "appPath": "calc",
      "arguments": null,
      "note": null
    },
    {
      "id": "step-2",
      "order": 1,
      "kind": "delay",
      "durationMs": 250,
      "note": null
    }
  ]
}
```

- **MacroStep payloads**:
  - `launch`: `appPath`, `arguments?`, `note?`
  - `keys`: `keys`, `repeat?`, `note?`
  - `delay`: `durationMs`, `note?`
  - `script`: `language ('powershell'|'bash'|'python')`, `script`, `note?`
- **Validation contract**: backend возвращает `AppError::Message` с JSON `{ kind: "profile-validation", errors: string[] }` если макросы не проходят проверку.

## Feature-Specific Implementation Notes

- **Log Panel (FR-013/FR-024)**: Frontend компонент `LogPanel.tsx` показывает текущий audit log с автообновлением (5 с), фильтрами INFO/WARN/ERROR/ACTION, поиском и fallback-кнопкой «Open log file». Backend команды `read_current_log` и `open_logs` обеспечивают чтение UTF-8 и открытие файла в проводнике. Состояние ошибок логируется через toasts.
- **Autostart & Read-only Guard (FR-009/FR-021, NFR-006)**: Zustand-стор `autostartStore.ts` синхронизирует статусы Enabled/Disabled/Unsupported/Errored, отображает Retry, ссылку на инструкции и баннер read-only. Сервис `storage_guard.rs` эмитит `system://storage-mode` для Safe Mode, UI блокирует destructive действия и предлагает инструкции в quickstart.
- **Backup Retention (FR-019)**: `storage::mod.rs` и интеграционный тест `profile_backups.rs` гарантируют FIFO-ротацию пяти поколений с записью события в audit log. При превышении лимита пользователю показывается toast.

## Validation & Testing Strategy

- **Unit/Integration (Rust)**: `cargo nextest` покрывает storage миграции, audit log ротацию и автозапуск (mock plugins).
- **Frontend unit**: `vitest` проверяет фильтрацию Log Panel, read-only UI состояния и локализационные ключи.
- **Playwright e2e**: 
  - `autostart.spec.ts` — статусы автозапуска, read-only баннер и Retry flow.
  - `notifications.spec.ts` — сценарии Log Panel, импорт/экспорт, ошибки чтения журнала.
  - `storage-guard.spec.ts` — безопасный режим при отсутствии записи.
  - `linux-fallback.spec.ts` — сценарии Linux fallback (toggle автозапуск, переключение профиля, open logs).
  - `pie-menu.spec.ts` / `action-execution.spec.ts` — горячая клавиша → меню → действие без подтверждений.
  - `hotkey-conflict.spec.ts` — UI конфликтов хоткеев, предложения альтернатив и запись в audit log (FR-020).
  - `localization.spec.ts` / `localization-negative.spec.ts` — переключение локализации и fallback.
  - `offline.spec.ts` — оффлайн-режим, запуск логов и импорт/экспорт без сети.
  - `update-checker.spec.ts` — GitHub release polling, кэширование последнего ответа и оффлайн fallback (FR-025).
- **Performance & Telemetry**: Playwright perf-сценарии `tests/perf/latency.spec.ts` и `tests/perf/fps.spec.ts` собирают CSV/PNG-отчёты в `tests/perf/reports/`, фиксируя метрики NFR-001/002/003/004 и снапшоты памяти.
- **Manual/Hybrid**: Чеклист NFR-006 хранится в `quickstart.md` вместе с скриншотами Windows/macOS/Linux; результаты latency/FPS измерений и UX-паритета документируются в Phase 6 задачах (T037a/T037c/T037h/T037i).
- **Offline Resilience (NFR-005)**: `offline.spec.ts` отключает сеть, проверяет сохранение функционала импорта/экспорта, логов, автозапуска и отображает предупреждения при попытке сетевых операций.
- **Cross-Platform UX Parity (NFR-006)**: macOS/Linux паритет подтверждается тестами `autostart.spec.ts`, `linux-fallback.spec.ts`, `notifications.spec.ts` и ручной проверкой меню/трэй статусов; тесты и ревью учитывают критерии из NFR-006 (чеклист функциональных состояний, скриншоты, временные метрики, Linux fallback).
- **Documentation**: quickstart.md содержит инструкции по Log Panel, автозапуску и read-only; актуализируется в T035/T134d.

## Feature Coverage Table (FR-012/FR-013/FR-024)

| Feature | Description | Implementation | Tests | Status |
|---------|-------------|----------------|-------|--------|
| **FR-012** | Локализация (EN/RU, JSON) | `src/state/localizationStore.ts`, `src-tauri/resources/localization/{en,ru}.json` | `tests/e2e/localization.spec.ts`, `tests/e2e/localization-negative.spec.ts`, `scripts/validate-i18n.mjs` | ✅ Complete |
| **FR-013** | Log Panel (UI) | `src/components/log/LogPanel.tsx`, auto-refresh 5s, filters (INFO/WARN/ERROR/ACTION), search | `tests/e2e/log-panel.spec.ts` | ✅ Complete |
| **FR-024** | Локальные журналы (backend) | `src-tauri/src/commands/logs.rs` (`read_current_log`, `open_logs`), audit log rotation | `src-tauri/tests/integration/profile_backups.rs` (rotation), `tests/e2e/log-panel.spec.ts` (UI integration) | ✅ Complete |

**Coverage Summary**:
- **E2E Tests**: `localization.spec.ts` (language switching), `localization-negative.spec.ts` (missing keys), `log-panel.spec.ts` (filters/search/open file)
- **Lint Automation**: `scripts/validate-i18n.mjs` generates `i18n-lint.json` report
- **Integration Tests**: `src-tauri/tests/integration/profile_backups.rs` validates audit log rotation
- **Performance**: Localization switching < 50ms (no UI freeze), log panel auto-refresh every 5s without blocking

**Related Documentation**:
- Quickstart: See [quickstart.md](quickstart.md#validation-summary-t035t037) for validation commands
- UX Parity: See [ux-parity-checklist.md](ux-parity-checklist.md) for FR coverage against NFR-006
- Performance Baseline: See `autohotpie-tauri/tests/perf/reports/performance-baseline.md`

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

