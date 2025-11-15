# Data Model: Windows-only AtlasPie Cleanup

## 1. PlatformArtifact
- **Description**: Любой файл, каталог или артефакт конфигурации, связанный с конкретной ОС.
- **Fields**:
  - `path: string` — абсолютный или репозиториный путь (например, `autohotpie-tauri/scripts/linux/setup.sh`).
  - `platform: "linux" | "macos" | "dual"` — основная платформа происхождения.
  - `artifactType: "source" | "script" | "config" | "doc" | "test" | "asset"`.
  - `removalStatus: "pending" | "removed" | "whitelisted"` — whitelisted допускается только для архивных ссылок.
  - `removalMethod: "delete" | "rewrite" | "replace"` — delete = полный удаление, rewrite = переписать содержимое под Windows, replace = заменить альтернативой.
  - `owner: string` — ответственный модуль (например, `src-tauri/services/tray`).
  - `notes?: string` — пояснения, куда перенесён функционал.
- **Validation rules**:
  - `platform != "linux"` или `removalStatus == "removed"` (т.к. конечный репозиторий не должен содержать Linux артефактов).
  - `removalStatus == "whitelisted"` допускается только если `artifactType == "doc"` и в файле стоит пометка `Legacy`.

## 2. CodePath
- **Description**: Представляет модуль или файл Rust/TypeScript с платформенными ветками.
- **Fields**:
  - `modulePath: string` — например, `src-tauri/src/services/autostart.rs`.
  - `hasCfgGates: boolean` — обнаружены ли `#[cfg(target_os)]` или `process.platform` ветки.
  - `windowsImplementation: string` — ссылка на оставшийся код/файл после очистки.
  - `deprecatedBranches: string[]` — список удалённых платформенных веток.
  - `replacementAPIs: string[]` — Win32 или Tauri API, которые теперь используются.
  - `testCoverage: string[]` — тесты, покрывающие работу этого кода после миграции (например, `tests/e2e/pie-menu.spec.ts`).
- **State transitions**:
  1. `legacy` → `isolated` (ветки Linux/macOS вынесены в отдельные файлы для удаления).
  2. `isolated` → `windows-only` (оставлен единственный файл/ветка без cfg).
  3. `windows-only` → `validated` (cargo check + pnpm test прошли без упоминаний удалённых API).

## 3. BuildConfiguration
- **Description**: Конкретный набор настроек и зависимостей для сборки (Cargo, Tauri, npm, CI).
- **Fields**:
  - `name: string` — например, `cargo`, `tauri.conf`, `github-actions/windows-release`.
  - `files: string[]` — затронутые конфигурационные файлы.
  - `dependenciesRemoved: string[]` — список crate/npm пакетов, убранных как платформенные.
  - `windowsTargets: string[]` — итоговый список target triple/runner (например, `x86_64-pc-windows-msvc`).
  - `scripts: { id: string; command: string; platformGuard?: string }[]` — оставшиеся npm/pnpm/PowerShell скрипты.
  - `status: "draft" | "updated" | "validated"` — validated после успешных проверок (`cargo check`, `pnpm test`, GitHub Actions).

## 4. TestProfile
- **Description**: Конфигурация Playwright/Vitest/CI теста.
- **Fields**:
  - `suite: "playwright" | "vitest" | "integration" | "gh-actions"`.
  - `projectName: string` — например, `windows-chromium`.
  - `osRunner: string` — фактический раннер или окружение.
  - `fixtures: string[]` — используемые фикстуры/моки.
  - `status: "active" | "removed" | "needs-update"`.
  - `linkedArtifacts: string[]` — снапшоты/моки, которые должны быть пересобраны.
- **Validation rules**:
  - После миграции разрешён только `osRunner == "windows"` (или `windows-latest` для CI).
  - `status == "removed"` обязателен для всех не-Windows проектов.

## 5. DocumentationSection
- **Description**: Блок документации или локализации, требующий обновления.
- **Fields**:
  - `filePath: string` — путь к документу (`README.md`, `specs/.../quickstart.md`).
  - `audience: "developer" | "user" | "ci"`.
  - `platformScope: "windows" | "legacy" | "mixed"`.
  - `requiredUpdates: string[]` — список пунктов, которые нужно исправить (удалить упоминание macOS, переписать инструкцию и т.п.).
  - `status: "pending" | "updated" | "reviewed"`.
  - `lastReviewer?: string`.
- **Constraints**:
  - В финальном состоянии все актуальные документы должны иметь `platformScope == "windows"` и `status == "reviewed"`.

## 6. VerificationRun
- **Description**: Конечная проверка после очистки.
- **Fields**:
  - `id: string` — например, `VR-001-cargo-check`, `VR-004-grep-scan`.
  - `commands: string[]` — фактические команды (`cargo clean`, `cargo check`, `pnpm install`, `pnpm test`, `rg ...`).
  - `result: "pass" | "fail"`.
  - `logPath?: string` — ссылка на лог GitHub Actions или локальный лог.
  - `timestamp: DateTime`.
- **State transitions**:
  1. `scheduled` → `running` (команда запущена локально или в CI).
  2. `running` → `pass`/`fail`. При `fail` добавляется ссылка на лог и создаётся `PlatformArtifact`/`BuildConfiguration` задача для исправления.

---

Эти сущности покрывают основные области миграции: физические файлы, кодовые пути, конфиги, тесты, документацию и финальные проверки. Они используются в плане для трассировки прогресса и контроля требований SC-001…SC-005.
