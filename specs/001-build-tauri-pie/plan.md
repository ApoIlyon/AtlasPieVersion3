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

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

