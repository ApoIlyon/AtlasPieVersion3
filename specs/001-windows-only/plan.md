# Implementation Plan: Windows-only AtlasPie Cleanup

**Branch**: `001-windows-only` | **Date**: 2025-11-16 | **Spec**: `specs/001-windows-only/spec.md`
**Input**: Feature specification from `/specs/001-windows-only/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Проект переводит AtlasPie на единственную целевую платформу Windows, устраняя все Linux/macOS артефакты: файлы, условные ветки, зависимости, тестовые профили и документацию. Технический подход базируется на двойном сканировании артефактов (статический список + поиск по ключам), сведении backend/frontend к одному Windows-код-пути, ведении `specs/001-windows-only/allowlist.md` для допустимых зависимостей и фиксации измеримых логов (`timings.json`, `workflow-log.md`, `playwright-log.json`) в `artifacts/verification/`.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Rust 1.75+ (Tauri backend), TypeScript/React 18 on Node.js 18 LTS, PowerShell 7+ для автоматизации.  
**Primary Dependencies**: Tauri 1.x core (без платформенных плагинов), @tauri-apps/plugin-global-shortcut (Windows режим), Zustand, Playwright (windows-chromium), pnpm 8.  
**Storage**: Локальные JSON/файлы `%APPDATA%/AutoHotPie` (чтение/запись через существующие сторы).  
**Testing**: `cargo check`/`cargo test`, `pnpm test` (Vitest), `npx playwright test --project=windows-chromium`, GitHub Actions workflow на `windows-latest`.  
**Target Platform**: Windows 10/11 x64 (`x86_64-pc-windows-msvc`).
**Project Type**: Desktop (monorepo `autohotpie-tauri` + specs).  
**Performance Goals**: Сохранить ожидаемое поведение hotkey→menu (<50 мс) и действия (<200 мс) из исходной спецификации; пайплайн CI должен укладываться <15 мин.  
**Constraints**: Запрещены упоминания/зависимости Linux/macOS; документация и UI должны описывать только Windows.  
**Scale/Scope**: Полный рефактор кода/документов/тестов репозитория (autohotpie-tauri + specs), охватывающий ~50+ файлов backend/frontend/CI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` содержит только placeholders без реальных принципов → дополнительных ограничений нет.  
**Gate Status (pre-Phase 0)**: PASS — можно продолжать.

## Project Structure

### Documentation (this feature)

```text
specs/001-windows-only/
├── plan.md               # данный документ
├── research.md           # решения сканирования/очистки
├── data-model.md         # сущности PlatformArtifact/CodePath/...
├── quickstart.md         # сценарий очистки и проверки
├── contracts/
│   └── cleanup-control.md
├── checklists/
│   ├── requirements.md
│   └── windows-only-requirements.md
├── artifacts/
│   ├── platform-artifacts.csv
│   └── verification/
│       ├── README.md
│       ├── timings.json
│       ├── workflow-log.md
│       ├── playwright-log.json
│       └── allowlist-report.json
├── allowlist.md          # список разрешённых зависимостей/команд
└── tasks.md              # будет создан /speckit.tasks
```

### Source Code (repository root)

```text
autohotpie-tauri/
├── src/                       # React/TypeScript UI (components, screens, state)
├── src-tauri/
│   ├── Cargo.toml
│   └── src/
│       ├── commands/
│       ├── services/
│       ├── storage/
│       └── main.rs
├── tests/
│   ├── e2e/
│   ├── perf/
│   └── unit/
├── scripts/
└── package.json

AutoHotPiehttps-main/          # исторические материалы (не трогаем)
kando-2.1.0-beta.1-main/       # legacy
specs/                         # документация
```

**Structure Decision**: Работа ограничивается монорепозиторием `autohotpie-tauri/` (backend+frontend+tests) и артефактами в `specs/`. Сторонние папки (`AutoHotPiehttps-main`, `kando-2...`) используются только как ссылки и не включаются в активный код.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None_ | — | — |

## Phase 0: Research & Input Consolidation
- Провести двойное сканирование артефактов (статический список путей + `rg` по ключам) и зафиксировать находки в `PlatformArtifact` каталоге.  
- Определить стратегию удаления cfg/веток для Rust (`rewriteCodePath`) и обновления frontend локализаций.  
- Согласовать список зависимостей/конфигов для чистки (`pruneDependencies`).  
- Результаты задокументированы в `research.md`; неизвестных вопросов не осталось → Phase 0 complete.

## Phase 1: Design & Contracts
- Зафиксировать сущности (PlatformArtifact, CodePath, BuildConfiguration, TestProfile, DocumentationSection, VerificationRun) в `data-model.md` для отслеживания прогресса.  
- Описать Quickstart (workflow из 6 шагов) включая команды проверки и troubleshooting.  
- Подготовить контракт `contracts/cleanup-control.md` для автоматизирующих скриптов (`scanPlatformArtifacts`, `pruneDependencies`, `verifyWindowsOnly`).  
- Обновить агентный контекст (`.windsurf/rules/specify-rules.md`) — добавлены сведения о новой задаче.  
- Constitution re-check после Phase 1: всё ещё PASS (новые документы соответствуют требованиям).

## Phase 2: Execution Outline
1. **Удаление файлов/директорий**: использовать `scanPlatformArtifacts`, удалить `scripts/*.sh`, `.desktop/.service`, Wayland/GTK ресурсы, перевести остатки в `docs/legacy` при необходимости.
2. **Backend cleanup**: для каждого сервиса (tray, hotkeys, pie_overlay, autostart, updates) выполнить `rewriteCodePath`, оставить единственный Windows-путь, удалить Linux/macOS команды/модули и связанные crates, документируя любые оставшиеся зависимости в `allowlist.md`.
3. **Frontend cleanup**: устранить `process.platform` ветки, удалить Linux/macOS UI (LinuxFallbackPanel, MenuBarToggle), обновить Zustand сторы и invoke-слой, синхронизировав его с allowlist.
4. **Конфиги и зависимости**: запустить `pruneDependencies` над `Cargo.toml`, `package.json`, `tauri.conf.json5`, GitHub Actions workflows; оставить только Windows runner и msbuild/msi pipeline, фиксируя исключения в allowlist.
5. **Тесты и документы**: удалить Playwright проекты/снапшоты других ОС, скорректировать README/INSTALL/specs/quickstart для Windows, обновить Vitest/Playwright конфиги, а также зафиксировать логи `workflow-log.md` и `playwright-log.json` после первого успешного прогона.
6. **Финальная проверка**: `cargo clean`, `cargo check`, `pnpm install`, `pnpm test`, `npx playwright test --project=windows-chromium`, `rg`-поиск ключей; измерить длительность (`timings.json`), обновить VerificationRun записи и убедиться, что `git status` чист.
