# Quickstart: Windows-only AtlasPie Cleanup

## Purpose
Запустить полный цикл очистки репозитория от Linux/macOS артефактов и убедиться, что сборка, тесты и документация отражают исключительно Windows.

## Prerequisites
1. **Среда**: Windows 11 с установленными Git, Node.js 18 LTS, pnpm, Rust 1.75+, Visual Studio Build Tools (Desktop C++ workload).
2. **Инструменты анализа**: `rg` (ripgrep) и PowerShell 7+.
3. **Репозиторий**: активная ветка `001-windows-only`, рабочее дерево чистое (`git status` без лишних файлов).

## Workflow Overview
1. Сканирование и удаление файлов/директорий.
2. Очистка Rust backend (`src-tauri`).
3. Очистка фронтенда (`src/`).
4. Обновление конфигов и зависимостей.
5. Сокращение CI/тестов.
6. Финальное тестирование и проверка.

## Step-by-step
### 1. Сканирование файлов
```powershell
rg -i "linux|macos|darwin|systemd|xdg|launchctl|appimage|deb|gnome|wayland|gtk" -g"!*CHANGELOG*" -n
Get-ChildItem -Recurse -Include *.desktop,*.service -Path autohotpie-tauri
Get-ChildItem autohotpie-tauri\scripts -Filter *.sh -Recurse
```
- Удаляем найденные пути или перемещаем в архив (`docs/legacy/`).
- Фиксируем прогресс в таблице `PlatformArtifact` (см. data-model).

### 2. Rust backend cleanup
1. В каталоге `autohotpie-tauri/src-tauri/src` удалить все `mod linux`, `mod macos`, `#[cfg(target_os != "windows")]`.
2. Переписать сервисы (tray, hotkeys, pie_overlay, autostart, updates) на явный Windows-путь.
3. Запустить `cargo fmt` и `cargo check` для валидации.

### 3. Frontend cleanup
1. Удалить `isLinux`, `isMac`, `process.platform` проверки, компоненты `LinuxFallbackPanel`, `MenuBarToggle` и прочие OS-специфичные UI.
2. Обновить Zustand сторы, чтобы они ссылались только на оставшиеся Tauri-команды.
3. Переписать строки локализации: все подсказки, ошибки и инструкции указывают Windows-пути (`%APPDATA%`, Startup Folder, Win32 хоткеи).

### 4. Конфигурация и зависимости
1. `Cargo.toml`: удалить плагины `tauri-plugin-autostart`, `macos-private-api`, systemd/inotify crates; обновить features.
2. `package.json`/`pnpm-lock.yaml`: удалить npm-пакеты для Linux/macOS, почистить скрипты.
3. `tauri.conf.json5`: оставить только `bundle.windows` и связанные настройки.
4. GitHub Actions/Husky: убрать job'ы `ubuntu-latest`, `macos-latest`, Dockerfile для Linux.

### 5. Тесты и CI
1. Удалить Playwright проекты `linux-chromium`, `webkit`, и связанные снапшоты.
2. Обновить `tests/e2e/playwright.config.ts` до одного проекта `windows-chromium`.
3. Обновить Vitest, unit/integration конфиги: никакой условной логики по платформе.
4. Настроить единственный workflow: `pnpm install`, `pnpm test`, `cargo check`, Windows installer build.

### 6. Финальная проверка
```powershell
cargo clean
cargo check --manifest-path autohotpie-tauri/src-tauri/Cargo.toml
pnpm install
pnpm test
npx playwright test --project=windows-chromium
rg -i "linux|macos|darwin|systemd|xdg|launchctl|appimage|deb|gnome|wayland|gtk" -g"!*CHANGELOG*" -n
```
- Все команды должны завершиться успешно.
- `git status` → чисто, нет новых linux/macOS файлов.

## Documentation updates
- README.md: оставить инструкции по установке/сборке только для Windows.
- specs/docs: добавить ссылку на данный quickstart, отметить, что поддерживается только Windows.

## Troubleshooting
- **Находятся упоминания Linux в lock-файлах**: пересобрать `pnpm-lock.yaml` после удаления пакетов (`pnpm install --lockfile-only`).
- **Cargo check требует удалённое crate**: перепроверьте `Cargo.toml` features; возможно, оно осталось в зависимости другого модуля.
- **Playwright жалуется на отсутствующие снапшоты**: удалите папки `tests/e2e/__snapshots__/*linux*/*mac*` и пересоздайте Windows-версии (`npx playwright test --update-snapshots`).

## Verification artefacts
- Журнал команд и поисков хранить в `specs/001-windows-only/artifacts/verification/` (логи `cargo`, `pnpm`, `rg`).
- Отчёт по `VerificationRun` приложить к плану (см. Success Criteria SC-001…SC-005).
