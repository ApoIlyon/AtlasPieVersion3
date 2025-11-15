---

description: "Task list for Windows-only AtlasPie cleanup"
---

# Tasks: Windows-only AtlasPie Cleanup

**Input**: Design documents from `/specs/001-windows-only/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Acceptance focuses on search/verification commands listed per user story.

**Organization**: Tasks follow user stories to keep each slice independently deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story label (US1, US2, US3) — omitted for setup/foundational/polish phases
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подготовить артефакт-трекинг и вспомогательные инструменты для миграции.

- [ ] T001 Создать `specs/001-windows-only/artifacts/` и шаблон `platform-artifacts.csv` для фиксации удаляемых Linux/macOS файлов.
- [ ] T002 [P] Сконфигурировать каркас `autohotpie-tauri/scripts/windows-only/scan-platform-artifacts.ps1` с чтением паттернов из `specs/001-windows-only/contracts/cleanup-control.md`.
- [ ] T003 [P] Добавить `specs/001-windows-only/artifacts/verification/README.md` с чеклистом финальных команд (`cargo`, `pnpm`, `rg`).
- [ ] T004 [P] Создать `specs/001-windows-only/allowlist.md` с разделами для зависимостей и invoke-команд (поля: модуль, причина, Win32 аналог, владелец).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Общие автоматизации, которые понадобятся всем user story.

- [ ] T005 Реализовать функцию `scanPlatformArtifacts` в `autohotpie-tauri/scripts/windows-only/scan-platform-artifacts.ps1` (вывод JSON+CSV), соблюдая контракт.
- [ ] T006 [P] Реализовать `autohotpie-tauri/scripts/windows-only/prune-dependencies.ps1` для пакетного удаления Linux/macOS зависимостей в Cargo/npm/tauri конфигурациях.
- [ ] T007 [P] Реализовать `autohotpie-tauri/scripts/windows-only/verify-windows-only.ps1` (последовательность `cargo clean/check`, `pnpm install/test`, `npx playwright test`, `rg`-поиск) с логированием в `specs/001-windows-only/artifacts/verification/`.
- [ ] T008 Зафиксировать первоначальный отчёт `specs/001-windows-only/data/platform-artifacts-initial.json` (snapshot результата T005) как baseline для дальнейшего контроля.
- [ ] T009 [P] Добавить шаг в verify-скрипт для подсчёта длительности каждой команды (start/end timestamps) и записи в `specs/001-windows-only/artifacts/verification/timings.json`.

**Checkpoint**: инструменты поиска/очистки готовы — можно выполнять user stories.

---

## Phase 3: User Story 1 – Очистить репозиторий от Linux/macOS артефактов (Priority: P1) 🎯 MVP

**Goal**: Удалить все файлы/каталоги, созданные специально для Linux/macOS.

**Independent Test**: `scan-platform-artifacts.ps1` не находит упоминаний, а дерево не содержит `*.sh`, `.desktop`, `.service`, Wayland/GTK ресурсов.

### Implementation for User Story 1

- [ ] T010 [US1] Запустить T005-скрипт и задокументировать каждый найденный артефакт в `specs/001-windows-only/artifacts/platform-artifacts.csv` (указать путь, тип, статус).
- [ ] T011 [P] [US1] Удалить папки/файлы `autohotpie-tauri/src-tauri/src/commands/linux_*` и связанные вызовы (регистрация команд, модульные импорты).
- [ ] T012 [P] [US1] Очистить `autohotpie-tauri/scripts/` от Linux/macOS-скриптов (`*.sh`, `linux*/`, `macos*/`) и обновить `package.json`/README ссылки на них.
- [ ] T013 [P] [US1] Удалить `.desktop`, `.service`, `appstream/` и Wayland/GTK assets из `autohotpie-tauri/src-tauri/resources/` и `autohotpie-tauri/src-tauri/icons/`.
- [ ] T014 [US1] Переместить любые legacy-упоминания Linux/macOS (например, `docs/` или `specs/001-build-tauri-pie/` артефакты) в архив `docs/legacy/` с заметкой "Legacy cross-platform".
- [ ] T015 [US1] Повторно запустить скрипт `scan-platform-artifacts.ps1`, убедиться, что CSV пустой, и приложить отчёт в `specs/001-windows-only/artifacts/verification/`.

**Checkpoint**: Репозиторий очищен от файлов других платформ.

---

## Phase 4: User Story 2 – Перенастроить код и конфиги под Windows-only (Priority: P2)

**Goal**: Оставить единственные Windows-код-пути и зависимости.

**Independent Test**: `cargo check`, `pnpm test`, `npx playwright test --project=windows-chromium` успешно завершаются на Windows без запросов Linux/macOS ресурсов.

### Implementation for User Story 2

- [ ] T016 [US2] Удалить все `#[cfg(target_os ...)]` ветки и linux/macos вспомогательные функции в `autohotpie-tauri/src-tauri/src/services/autostart.rs`, оставить Win32 реализацию и зафиксировать новую команду в `allowlist.md`.
- [ ] T017 [P] [US2] Переписать `autohotpie-tauri/src-tauri/src/services/tray.rs` под Windows-only: убрать Menu Bar Toggle, Linux fallback, лишние feature flags и связанные ивенты.
- [ ] T018 [P] [US2] Очистить `autohотpie-tauri/src-tauri/src/commands/hotkeys.rs` от альтернативных реализаций (macOS/Linux) и централизовать регистрацию хоткеев через Win32/Tauri shortcut плагин, отражая invoke-команды в allowlist.
- [ ] T019 [US2] Удалить платформенные ветки в остальных сервисах (`src-tauri/src/services/pie_overlay.rs`, `system_status.rs`, `updates.rs`) и синхронизировать импорты.
- [ ] T020 [P] [US2] Убрать проверки `process.platform`, `isLinux`, `isMac` и guard-компоненты в фронтенде (`autohotpie-tauri/src/components/tray/`, `src/screens/SettingsAutostart.tsx`, `src/state/autostartStore.ts`), сверив invoke-команды с allowlist.
- [ ] T021 [P] [US2] Удалить `LinuxFallbackPanel`, `MenuBarToggle` и другие OS-специфичные React-компоненты; обновить маршруты и импорты.
- [ ] T022 [US2] Почистить `autohotpie-tauri/src-tauri/Cargo.toml` (features, deps) от Linux/macOS crates, затем выполнить `cargo tree` для проверки и обновить lockfile.
- [ ] T023 [P] [US2] Обновить `autohотpie-tauri/package.json` и `pnpm-lock.yaml`: убрать linux/macos npm-пакеты, npm-скрипты (`tauri build --target ...`), пересобрать lockfile, задокументировать оставшиеся пакеты в allowlist.
- [ ] T024 [US2] Переписать `autohotpie-tauri/src-tauri/tauri.conf.json5`, оставив только `bundle.windows` и удалив секции `linux`, `macOS`, `docker`.
- [ ] T025 [US2] Сократить `.github/workflows/` до одного Windows pipeline (msix/msi) и удалить macOS/Linux jobs, Husky hook'и и Dockerfile для Linux.
- [ ] T026 [US2] Выполнить `cargo clean && cargo check`, `pnpm install`, `pnpm test`, `npx playwright test --project=windows-chromium`; сохранить логи и обновить `timings.json`.


**Checkpoint**: Кодовая база и конфиги поддерживают только Windows.

---

## Phase 5: User Story 3 – Обновить документацию, тесты и проверки (Priority: P3)

**Goal**: Документация и QA-пайплайны описывают только Windows.

**Independent Test**: README/Quickstart/INSTALL говорят только о Windows, Playwright/Vitest конфиги содержат один проект `windows-chromium`, CI матрица без Linux/macOS.

### Implementation for User Story 3

- [ ] T027 [US3] Переписать `README.md` и `docs/INSTALL.md`, убрав ссылки на Linux/macOS и добавив подробные шаги установки/обновления для Windows.
- [ ] T028 [P] [US3] Обновить `specs/001-build-tauri-pie/` и `specs/001-windows-only/quickstart.md`, чтобы все инструкции, troubleshooting и success criteria упоминали только Windows и ссылались на verification scripts.
- [ ] T029 [US3] Сократить `autohotpie-tauri/tests/e2e/playwright.config.ts` до одного проекта `windows-chromium`, удалить линуксовые/маковские тесты и их снапшоты (`tests/e2e/**/__snapshots__/*linux*/*mac*`).
- [ ] T030 [P] [US3] Удалить или переписать Playwright спеки, моделирующие другие платформы (`tests/e2e/linux-fallback.spec.ts`, `menu-bar.spec.ts`, т.п.), заменив их Windows-эквивалентами или документируя архив в `docs/legacy/`).
- [ ] T031 [US3] Удалить условные проверки платформы из Vitest/unit тестов (`tests/unit/`, `tests/integration/`) и обновить мок-данные/fixtures на Windows-only значения.
- [ ] T032 [US3] Обновить GitHub Actions/Playwright документацию (`.github/workflows/README.md`, `docs/ci.md` если есть) и добавить ссылку на `verify-windows-only.ps1` как обязательный шаг.
- [ ] T033 [US3] После правок конфигов выполнить `npx playwright test --project=windows-chromium`, сохранить лог в `specs/001-windows-only/artifacts/verification/playwright-log.json` и обновить `workflow-log.md` ссылкой на успешный Windows workflow.

**Checkpoint**: Пользователи и CI видят только Windows-флоу.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Финальные проверки, документация и контроль качества.

- [ ] T034 Запустить `scripts/windows-only/verify-windows-only.ps1`, собрать полный лог выполнения, обновить `timings.json` и `workflow-log.md`, приложить их к `specs/001-windows-only/artifacts/verification/`.
- [ ] T035 [P] Выполнить финальный `rg -i "linux|macos|darwin|systemd|xdg|launchctl|appimage|deb|wayland|gtk" -g"!*CHANGELOG*"` и обновить раздел **Success Criteria** в `specs/001-windows-only/spec.md` результатами поиска/логами.

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)** → нет зависимостей.
- **Foundational (Phase 2)** → зависит от Phase 1, блокирует все user stories.
- **User Stories (Phases 3–5)** → стартуют после Phase 2. Истории независимы и могут выполняться параллельно, но рекомендуется порядок P1 → P2 → P3 для MVP.
- **Polish (Phase 6)** → после завершения нужных user stories.

### User Story Dependencies
- **US1**: не зависит от других историй, формирует MVP.
- **US2**: зависит от инфраструктуры Phase 2; может выполняться параллельно с финальными шагами US1, но не должна стартовать до завершения удаления файлов, затрагивающих код.
- **US3**: зависит от завершения US2 (документация и тесты опираются на итоговую архитектуру).

### Within Each User Story
- Пользовательские истории следуют порядку: инструменты/данные → удаление/рефакторинг → валидация.
- Проверки (например, `scan-platform-artifacts`, `verify-windows-only`) выполняются после внесённых правок, чтобы подтвердить критерии приемки.

### Parallel Opportunities
- Setup и Foundational отметки [P] можно выполнять одновременно (разные файлы).
- В US1 задачи T009–T011 выполняются параллельно (разные каталоги), пока T008/T013 остаются последовательными.
- В US2 задачи T015–T019 и T021 могут идти параллельно, потому что затрагивают разные файлы (tray, hotkeys, frontend, package.json), но зависят от завершения T014/T020.
- В US3 задачи T026–T029 независимы (docs, Playwright, Vitest) — могут быть распределены между членами команды.

## Implementation Strategy

### MVP First (User Story 1)
1. Выполнить Phase 1–2, чтобы подготовить инструменты.
2. Реализовать Phase 3 (US1) и подтвердить отсутствие Linux/macOS артефактов.
3. Зафиксировать результаты в `artifacts/verification/` и при необходимости выкатить промежуточный релиз Windows-only кода.

### Incremental Delivery
1. **Release 1 (MVP)**: Phases 1–3.
2. **Release 2**: Phase 4 (US2) — переходим на Windows-only код/конфиги.
3. **Release 3**: Phase 5 (US3) + Phase 6 — документация, тесты, финальные проверки.

### Parallel Team Strategy
- После Phase 2 команда может разделиться:
  - Dev A: US1 file cleanup (T009–T011).
  - Dev B: US2 backend refactor (T014–T017).
  - Dev C: US2 frontend/config (T018–T023).
  - Dev D: US3 docs/tests (T025–T030).
- Полировка (T031–T032) выполняется совместно.
