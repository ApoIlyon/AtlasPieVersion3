# Quickstart Guide: AutoHotPie Tauri Native Suite

## Prerequisites
- **Rust** 1.75+ with `cargo` (install via rustup)
- **Node.js** 18 LTS and `npm`
- **Tauri CLI** (`cargo install tauri-cli`)
- Windows: Visual Studio Build Tools (Desktop development with C++)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Linux: `libgtk-3-dev`, `libayatana-appindicator3-dev`, `webkit2gtk-4.1`, `pkg-config`

## Install Dependencies
```bash
npm install
cargo fetch --manifest-path src-tauri/Cargo.toml
```

## Run in Development
```bash
npm run tauri dev
```
This launches the React frontend with hot reload and the Tauri backend.

## Build Release Artifacts
```bash
npm run tauri build
```
Output installers/bundles appear under `src-tauri/target/release/` (per-platform).

## Run Tests
```bash
# Rust unit/integration tests
cargo nextest run --manifest-path src-tauri/Cargo.toml

# Frontend unit tests
npm run test

# Playwright smoke E2E (Windows/Linux PR matrix)
npx playwright test --config tests/e2e/playwright.config.ts
```
For macOS nightly coverage, run the Playwright suite locally or via scheduled CI on `macos-latest`.

## Configuration & Data Paths
- Windows: `%APPDATA%/AutoHotPie`
- macOS: `~/Library/Application Support/AutoHotPie`
- Linux: `~/.config/AutoHotPie`

Logs rotate daily under the same directory. В разделе **Settings → Logs** доступна Log Panel:
- автообновление каждые 5 секунд;
- фильтрация по уровням (INFO/WARN/ERROR/ACTION) и строковый поиск;
- кнопки **Refresh** и **Open log file** (Tauri desktop only).
При ошибке чтения отображается toast с рекомендацией открыть файл напрямую из проводника.

### Logs & Troubleshooting

- **Open latest log**: в UI нажмите кнопку **Log → Open log file**; в десктопной сборке вызывается `open_latest_log` и откроется файл в системном проводнике.
- **Расположение файлов**: см. раздел выше «Configuration & Data Paths». Логи лежат рядом с настройками, ротация — ежедневно (лимит 50 MB).
- **Если кнопка не работает**:
  - Проверьте, что приложение запущено как desktop (не браузерный превью).
  - Убедитесь, что директория доступна для записи (см. Read-only mode ниже).
  - Откройте вручную: откройте указанный путь и файл `audit-*.log`.
- **Read-only mode**: когда директория недоступна для записи, лог-панель и destructive‑действия блокируются. Разрешите доступ или смените каталог данных и перезапустите приложение.

## Import/Export Profiles
1. Use **Settings → Profiles → Import** to select a JSON bundle.
2. Export via **Profiles Dashboard → Export** to create a JSON archive compatible across platforms.

## Update Check Workflow
- Приложение автоматически опрашивает GitHub-релизы каждые 6 часов (минимальный интервал — 1 час).
- В разделе **Settings → Updates** отображается текущая/последняя версия, время проверки и релизные заметки.
- Кнопка **Check for updates** запускает стандартную проверку (учитывая троттлинг), а **Force refresh** игнорирует кеш и выполняет запрос немедленно.
- При найденном обновлении кнопка **Open release page** открывает страницу релиза для загрузки установщика.
- В браузерном превью (без Tauri) раздел показывает заглушку о доступности функции только в десктопной сборке.
- Источник релизов задаётся переменными окружения `AUTOHOTPIE_UPDATE_OWNER` и `AUTOHOTPIE_UPDATE_REPO`; без них используется `Atlas-Engineering/AutoHotPie`.
- GitHub API токен для повышения лимита запросов (и приватных репозиториев) задаётся через `AUTOHOTPIE_UPDATE_TOKEN`.

## Выпуск релизов

1. Обновите версию в `package.json` и `src-tauri/tauri.conf.json` (а затем синхронизируйте `Cargo.toml`). Версия должна следовать SemVer.
2. Закоммитьте и запушьте изменения.
3. В GitHub откройте **Actions → Release Tauri (Windows)**, запустите workflow вручную (`Run workflow`) и укажите:
   - `version` — то же значение, что в исходниках.
   - `title`/`notes` — при необходимости (по умолчанию используется шаблон `AtlasPie vX.Y.Z`).
4. Workflow соберёт Windows-инсталлятор, подготовит `latest.json` и опубликует GitHub Release в репозитории `Apollyon/AtlasPieVersion3`.
5. Убедитесь, что в разделе Settings → Secrets & variables → Actions заданы `TAURI_PRIVATE_KEY`, `TAURI_KEY_PASSWORD` и `AUTOHOTPIE_UPDATE_TOKEN`.

## Troubleshooting
- **Autostart statuses** (Settings → Autostart):
  - **Enabled** — автозапуск успешно настроен (кнопка Disable доступна).
  - **Disabled** — автозапуск отключён, используйте **Enable autostart** для включения.
  - **Unsupported** — текущая сборка не поддерживает автозапуск (браузерный превью или отсутствует плагин ОС).
  - **Errored** — переключение не удалось. Нажмите **Retry** для повторной попытки; сообщение ошибки отображается под статусом.
- **Provider** поле под статусом показывает активный механизм автозапуска:
  - `systemd user service` — включён пользовательский юнит `~/.config/systemd/user/<identifier>.service`.
  - `XDG desktop entry` — используется файл `~/.config/autostart/<identifier>.desktop`.
  - `Windows Startup folder` — ярлык/скрипт в `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.
  - `macOS login item` — запись в **System Settings → General → Login Items**.
  - `Platform autostart plugin` — fallback через Tauri-плагин (Windows/macOS) в сборке без нативных интеграций.
- **Reason codes** помогают понять дальнейшие действия:
  - `entry_missing` — файл `.desktop` отсутствует; нажмите **Enable autostart** или создайте запись вручную.
  - `unit_missing` / `unit_disabled` — юнит systemd не найден или отключён. Используйте `systemctl --user enable --now <identifier>.service`.
  - `linux_no_provider` — ни systemd, ни XDG недоступны. Установите `systemd --user` или позвольте XDG автозапуску.
  - `plugin_missing` / `plugin_disabled` — Tauri-плагин автозапуска не доступен или отключён; проверьте конфигурацию сборки.
  - `shortcut_missing` — ярлык Windows удалён. Нажмите **Enable autostart** для регенерации.
  - `web_environment` — вы в браузерном превью; автозапуск появится только в десктопной версии.
  - Другие коды сопровождаются сообщением под статусом; сверяйтесь с журналом или stacktrace.
- **Read-only mode**: если каталог данных недоступен для записи, появляется баннер «Read-only safeguard».
  - Разблокируйте доступ или выберите альтернативный путь, затем перезапустите приложение.
  - Пока режим активен, управление автозапуском и логами заблокировано.
- **View instructions**: кнопка открывает раздел quickstart (#troubleshooting) в системном браузере. В десктопной сборке используется tauri-plugin-opener, в браузере ссылка открывается в новой вкладке.
- Global hotkey conflicts: see **Settings → Hotkeys**; reassign or disable conflicting bindings.
- Missing tray icon on Linux: ensure `libayatana-appindicator3` installed; fallback UI enabled otherwise.
- Accessibility prompts on macOS: enable permissions under **System Settings → Privacy & Security → Accessibility**.
- **macOS menu bar parity (NFR-006)**:
  1. На macOS 13+ убедитесь, что иконка AutoHotPie отображается в строке меню. При клике пункт **Toggle Pie Menu** синхронизируется с состоянием overlay.
  2. Откройте пункт **Status** → подтверждаем отображение:
     - `Active profile` — обозначает текущий активный профиль, совпадает с `profiles://active-changed`.
     - `Hotkey` — показывает зарегистрированное сочетание (по умолчанию `Command+Shift+P`).
     - `Safe mode` — отражает read-only/Fullscreen показания (`Safe mode enabled`/`Safe mode inactive`).
  3. Меню **Refresh status** обновляет данные после смены профиля или хоткея без перезапуска приложения.
  4. В UI-компоненте `MenuBarToggle` (overlay) отображается та же информация и история последнего действия; скриншоты закрепляются в `specs/001-build-tauri-pie/artifacts/macos-menu-bar.png` и `macos-menu-bar-details.png`.
  5. Smoke-проверка: запустите `npm run test:e2e -- --grep "US3 - Autostart settings" --project=webkit` после конфигурации macOS runner; приложите лог успешного прогона и обновите чеклист NFR-006.
- **Linux fallback parity (NFR-006)**:
  1. В окружении без системного трея (или с флагом `--mock tray=off`) убедитесь, что появляется панель Linux fallback и кнопка **Toggle** управляет pie-меню.
  2. Внутри панели отображаются блоки:
     - `Autostart` — статус, провайдер и причины (systemd/XDG/plugin); кнопки Enable/Disable работают и показывают ошибки.
     - `Hotkey`, `Active profile`, `Safe mode`, а также таймстемп последнего действия.
  3. Кнопка **Refresh autostart** синхронизирует состояние с бэкендом; **Open autostart location** открывает директорию автозапуска (или выдаёт ошибку в read-only).
  4. Кнопка **View instructions** ссылается на раздел troubleshooting quickstart; скриншоты панели сохраняются в `specs/001-build-tauri-pie/artifacts/linux-fallback-panel.png`.
  5. Smoke-тест: выполните `npm run test:e2e -- --grep "Linux fallback" --project=chromium` (используя новый `tests/e2e/linux-fallback.spec.ts`); приложите лог прогона к чеклисту NFR-006.

## Validation Summary (T035/T037)

| Область | Команда/действие | Артефакт/примечание |
|---------|------------------|---------------------|
| Полный smoke-suite | `npm run test:e2e` | HTML-отчёт Playwright: `autohotpie-tauri/tests/e2e/playwright-report/index.html` (48/48 пройдено, включая `linux-fallback.spec.ts`, `autostart.spec.ts`, `notifications.spec.ts`). |
| Локализация | `npm run test:e2e -- --grep "Localization"` | Проверяет `localization.spec.ts`; убедитесь, что новые ключи присутствуют в EN/RU и fallback-пакете (`localizationStore`). |
| UX паритет (NFR-006) | См. **[ux-parity-checklist.md](ux-parity-checklist.md)** | Полный чеклист функциональных состояний, side-by-side сравнение с AutoHotPie v1.x и Kando 2.0.0, метрики производительности. Скриншоты: `specs/001-build-tauri-pie/screenshots/` (to be collected). |
| UX паритет macOS/Linux | См. разделы выше + `npm run test:e2e -- --grep "Linux fallback" --project=chromium` | Скриншоты и чеклист: `specs/001-build-tauri-pie/artifacts/macos-menu-bar*.png`, `linux-fallback-panel.png`. |
| Доступность (ручная проверка) | Используйте макрозоны UI: High Contrast в Settings → Accessibility, проверка навигации клавиатурой по `MenuBarToggle` и Linux fallback панели | Зафиксируйте результаты в `specs/001-build-tauri-pie/research.md` при необходимости. |

> После каждого релиза обновляйте таблицу ссылками на свежие отчёты и скриншоты, чтобы соответствовать критериям NFR-006 и документировать прохождение e2e.
