# Feature Specification: Windows-only AtlasPie Cleanup

**Feature Branch**: `001-windows-only`  
**Created**: 2025-11-16  
**Status**: Draft  
**Input**: User description: "Цель Полностью очистить репозиторий от кода, настроек и зависимостей, связанных с Linux и macOS, чтобы проект собирался и работал только под Windows. Шаги Сканирование и удаление файлов/директорий Удалить файлы и папки, созданные специально для Linux/macOS (например, commands/linux_*, scripts/*.sh, любые .desktop, .service, appstream, Wayland/GTK ресурсы). Проверить каталоги specs/, docs/, .github/workflows/ — удалить все сценарии и документацию, описывающие нелинуксовые сборки (CI для Linux/macOS, скрипты публикации, инструкции по установке и т.д.). Очистка Rust-кода (src-tauri/src) В каждом файле убрать #[cfg(target_os = ...)] и условные ветки, оставить только реальные Windows-кодpath. Если раньше модуль делился на несколько реализаций — оставить только Windows-файл и убрать упоминания о других платформах (без заглушек). Перепроверить сервисы: tray, updates, system_status, hotkeys, pie_overlay и т.п., чтобы нигде не осталось вызовов Linux/macOS API (systemd, xdg, launchctl и т.д.). Удалить команды/сервисы, которые существовали только ради других платформ. Frontend (src/) Удалить проверки isLinux, isMac, process.platform и UI-блоки из React/TypeScript. Обновить тексты/локализации: все help-тексты, тултипы, ошибки должны говорить только про Windows. Перепроверить Zustand/Redux сторы и сервис-слои, чтобы не было обращений к Tauri-командам, которых больше нет. Конфигурация и зависимости Cargo.toml: выкинуть зависимости для других ОС (например, tauri-plugin-autostart, macos-private-api, любая обертка над systemd, inotify и т.д.). В features оставить только то, что реально используется на Windows. package.json, pnpm-lock.yaml, vite.config.ts и прочие конфиги: удалить платформенные флаги, npm-скрипты и зависимости под Linux/macOS. tauri.conf.json (или tauri.conf.json5): убрать секции macOS, linux, оставить только windows. Сборочные и CI скрипты GitHub Actions, Husky, PowerShell/Bash: удалить шаги, которые собирали .app, .deb, AppImage и т.п. Оставить один pipeline для Windows (например, msbuild/msi). Удалить Dockerfile, если использовался для Linux сборок. Обновить README/INSTALL.md — описать только Windows установку. Тесты Удалить Playwright/Unit/E2E тесты, которые моделируют другие платформы. Конфиги Playwright/Vitest — оставить только Windows профили. Переписать мок-данные или снапшоты, если в них фигурировали platform-specific поля. Проверка После чистки: cargo clean, cargo check, pnpm install, pnpm test (или используемый пакетный менеджер). Убедиться, что git status не показывает файлов, связанных с Linux/macOS. Финально пройтись поиском по словам linux, macos, darwin, systemd, xdg, launchctl, AppImage, deb, gnome, wayland, gtk — убедиться, что всё удалено."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Очистить репозиторий от Linux/macOS артефактов (Priority: P1)

Как владелец продукта я хочу гарантированно удалить из репозитория все файлы и каталоги, связанные с Linux/macOS, чтобы кодовая база отражала исключительно Windows-поддержку и не вводила разработчиков в заблуждение.

**Why this priority**: Пока артефакты других ОС присутствуют, команда тратит время на ложные пути разработки и рискует повторно включить неподдерживаемые конфигурации.

**Independent Test**: Можно полностью проверить, выполнив поиск по контролируемым ключевым словам (linux, macos, darwin и т.д.) и убедившись, что результаты отсутствуют вне исторических разделов changelog.

**Acceptance Scenarios**:

1. **Given** свежий checkout ветки `001-windows-only`, **When** выполняется скрипт `find-str` по ключам `linux|macos|darwin|systemd|xdg|launchctl`, **Then** в исходниках, тестах и документации не находится ссылок (кроме специально помеченных исторических заметок в changelog).
2. **Given** репозиторий просканирован по маскам `*.sh`, `.desktop`, `.service`, `appstream/`, **When** проверяется дерево файлов, **Then** ни один Linux/macOS-специфичный файл не остаётся в рабочем дереве.

---

### User Story 2 - Перенастроить код и конфиги под Windows-only (Priority: P2)

Как ведущий разработчик Tauri я хочу удалить условную компиляцию и зависимости для Linux/macOS и оставить только рабочие Windows-пути, чтобы проект собирался, тестировался и деплоился в единственной конфигурации.

**Why this priority**: Наличие неиспользуемых веток `#[cfg]` и пакетов усложняет обслуживание и создаёт риск невозможности собрать релиз.

**Independent Test**: Достаточно запустить `cargo check`, `pnpm install`, `pnpm test`, GitHub Actions workflow Windows release и проверить, что ни один шаг не требует файлов или фич для других ОС.

**Acceptance Scenarios**:

1. **Given** обновлённые `Cargo.toml`, `tauri.conf.json`, `package.json`, **When** выполняется анализ зависимостей, **Then** нет ссылок на плагины или пакеты, относящиеся к Linux/macOS.
2. **Given** исходники Rust и TypeScript, **When** проводится ревью на наличие `#[cfg(target_os != "windows")]`, `isMac`, `isLinux`, **Then** остаются только Windows-код-пути и UI сообщающий исключительно про Windows.

---

### User Story 3 - Обновить документацию, тесты и проверки (Priority: P3)

Как технический писатель и тест-инженер я хочу, чтобы README, quickstart, workflows и тестовые профили описывали только Windows-сборку и проверки, чтобы пользователи и CI не ожидали поддержки других ОС.

**Why this priority**: Несоответствие документации и тестов приводит к неправильным установкам и падениям пайплайнов.

**Independent Test**: Можно проверить, прочитав README/INSTALL/quickstart и запустив Playwright/Vitest конфигурации — они должны ссылаться только на Windows.

**Acceptance Scenarios**:

1. **Given** документация в `README.md`, `specs/`, `docs/`, **When** её читает новый пользователь, **Then** все инструкции ориентированы на Windows и не содержат ссылок на Linux/macOS.
2. **Given** тестовая матрица (Playwright, GitHub Actions), **When** она выполняется, **Then** доступны только Windows-профили/раннеры и нет ссылок на `ubuntu-latest`/`macos-latest`.

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- Что делать с историческими упоминаниями Linux/macOS в changelog/спецификациях? → Их нужно сохранить только в архивных разделах с явной пометкой «legacy», при этом текущая спецификация не должна ссылаться на поддержку других ОС.
- Как поступать с общими кроссплатформенными зависимостями (например, `tauri-plugin-autostart`), если они технически работают и на Windows? → Если функционал покрывается нативной Windows-реализацией или стандартным Tauri API, библиотека удаляется, иначе фиксируется в Assumptions как допустимая до написания замены.
- Как гарантировать, что Playwright снапшоты/моки не содержат Linux/macOS полей? → Все фикстуры пересобираются на Windows и сравниваются diff-инструментом; при обнаружении платформенных полей тест считается некорректным.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: Репозиторий ДОЛЖЕН быть очищен от всех файлов/каталогов, созданных специально для Linux/macOS (включая `commands/linux_*`, `scripts/*.sh`, `.desktop`, `.service`, `appstream/`, Wayland/GTK ресурсы).
- **FR-002**: Документация (`README`, `INSTALL`, `specs/`, `docs/`) ДОЛЖНА описывать только Windows-процессы установки, обновления и отладки; любые ссылки на другие ОС должны быть удалены или перенесены в архив.
- **FR-003**: Конфигурация Tauri (`tauri.conf.json`, `tauri.conf.json5`, `Cargo.toml` фичи, `package.json` скрипты) ДОЛЖНА содержать только Windows-таргеты и совместимые зависимости.
- **FR-004**: Код Rust (особенно `src-tauri/src`) ДОЛЖЕН быть очищен от `#[cfg(target_os ...)]` и альтернативных модулей, оставив единственный Windows-код-путь; сервисы, существовавшие исключительно ради других платформ, нужно удалить.
- **FR-005**: Frontend (React/TypeScript) ДОЛЖЕН удалить все проверки `isLinux`, `isMac`, `process.platform` и UI-блоки для других ОС, заменив их на Windows-ориентированные тексты и состояния.
- **FR-006**: Zustand/Redux сторы и invoke-слои ДОЛЖНЫ обращаться только к существующим Windows-командам Tauri; команды, удалённые на backend, не должны вызываться из UI. Список допустимых зависимостей/команд фиксируется в `specs/001-windows-only/allowlist.md` с кратким обоснованием и ссылкой на Win32 аналог, а любые обращения вне списка немедленно устраняются. Каждая верификация запускает `scripts/windows-only/check-allowlist.ps1`, который формирует `specs/001-windows-only/artifacts/verification/allowlist-report.json` и прерывает процесс при обнаружении несоответствий.
- **FR-007**: GitHub Actions, Husky, PowerShell/Bash скрипты ДОЛЖНЫ содержать только Windows-пайплайны (например, `windows-latest` runners, msbuild/msi пакеты) и не ссылаться на `.app`, `.deb`, AppImage, Docker для Linux.
- **FR-008**: Playwright/Vitest конфигурации и тесты ДОЛЖНЫ иметь только Windows-проекты/фикстуры; тесты, моделирующие другие платформы, следует удалить или переписать.
- **FR-009**: После очистки проект ДОЛЖЕН успешно проходить `cargo clean`, `cargo check`, `pnpm install`, `pnpm test` на Windows, не запрашивая отсутствующие платформенные зависимости.
- **FR-010**: Сквозная проверка (`git status`, глобальный поиск по ключевым словам) ДОЛЖНА подтверждать отсутствие ссылок на Linux/macOS за исключением специально помеченных архивных разделов.

### Key Entities *(include if feature involves data)*

- **PlatformArtifact**: Представляет файл или каталог, связанный с конкретной ОС (атрибуты: `path`, `platform`, `removalStatus`, `replacementNotes`).
- **BuildConfiguration**: Набор конфигураций для сборки/CI (`target`, `scripts`, `dependencies`, `runners`). Отражает текущее состояние поддерживаемых платформ.
- **TestProfile**: Профили Playwright/Vitest (`name`, `os`, `fixtures`, `status`). Используется для контроля, что остались только Windows-перепробеги.
- **DocumentationSection**: Раздел документации (`file`, `audience`, `platformScope`, `updatedAt`). Помогает отслеживать, какие материалы ещё упоминают другие ОС.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: Глобальный поиск `(?i)(linux|macos|darwin|systemd|xdg|launchctl|appimage|deb|wayland|gtk)` по репозиторию (исключая `CHANGELOG` legacy-разделы) возвращает 0 совпадений.
- **SC-002**: `cargo clean && cargo check`, `pnpm install`, `pnpm test` и локальный `npx playwright test --project=windows-chromium` завершаются на Windows 11 менее чем за 15 минут суммарно; время начала/окончания каждой команды и общий SLA сохраняются в `specs/001-windows-only/artifacts/verification/timings.json`.
- **SC-003**: Единственный GitHub Actions workflow `windows-latest` (msix/msi) проходит успешно, а ссылка на run ID, хэш коммита и длительность прогона задокументированы в `specs/001-windows-only/artifacts/verification/workflow-log.md`.
- **SC-004**: После чистки Playwright конфигурации проект `windows-chromium` проходит без ошибок; лог запуска (`test-results/.last-run.json` или экспортированный отчёт) копируется в `specs/001-windows-only/artifacts/verification/playwright-log.json`.
- **SC-005**: README.md и Quickstart проходят ручное ревью — в них минимум 3 явных упоминания Windows-шага (установка зависимостей, сборка, установка) и 0 ссылок на Linux/macOS.
- **SC-006**: `scripts/windows-only/check-allowlist.ps1` формирует `artifacts/verification/allowlist-report.json`, в котором нет нарушений (все обнаруженные invoke-команды и зависимости присутствуют в allowlist) и ссылка на отчёт приложена в итоговый лог.

## Assumptions & Constraints

- Существующие Windows-зависимости (например, Win32 API вызовы) остаются без изменений, даже если их названия упоминают «cross-platform».
- Исторические документы (архивы) допускаются только при явной пометке «Legacy» и исключаются из автоматических проверок.
- Если отдельные npm-пакеты используются для генерации Windows-артефактов, но содержат Linux-ориентированные саб-команды, их удаление допускается только при наличии Windows-эквивалента.
- Ведётся allowlist-файл `specs/001-windows-only/allowlist.md`, в котором фиксируются все оставленные зависимости и invoke-команды с обоснованием, почему они допустимы в Windows-only среде.
