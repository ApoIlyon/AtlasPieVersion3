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

## Log Access & Troubleshooting

### Открытие и навигация
1. В главном окне приложения нажмите **Logs** в шапке или перейдите **Settings → Logs**.
2. Используйте фильтры уровней (INFO/WARN/ERROR/ACTION) и строку поиска, чтобы сузить вывод.
3. В десктопной сборке доступны действия:
   - **Refresh** — повторно запрашивает последние 500 записей из Tauri (`read_logs`).
   - **Auto refresh** — включает/выключает автообновление каждые 5 секунд (по умолчанию включено).
   - **Open log file** — открывает актуальный файл аудита в проводнике через команду `open_latest_log`.

### Типовые сценарии
- **Log panel сообщает «доступно только в десктопной сборке»** — вы запустили браузерный превью. Логи доступны после запуска Tauri-версии.
- **Появился read-only режим** — каталог данных недоступен для записи (см. баннер Read-only safeguard). Лог-панель станет только для чтения, кнопки Refresh/Open становятся неактивны. Разблокируйте каталог, перезапустите приложение и повторите запрос.
- **Ошибка чтения («failed to read log file» и т. п.)** — кнопка **Dismiss** закрывает баннер, затем используйте **Open log file** либо вручную откройте файл из каталога данных: `AHP-Audit-YYYYMMDD.log`.
- **Нужны прежние записи** — ротация выполняется ежедневно; доступные файлы лежат в `logs/` внутри каталога данных. Можно открыть их редактором текста или скопировать в баг-репорт.

### Ручной доступ
- Windows: `%APPDATA%/AutoHotPie/logs`
- macOS: `~/Library/Application Support/AutoHotPie/logs`
- Linux: `~/.config/AutoHotPie/logs`

Если лог-панель не открывается из-за повреждения профилей, используйте кнопку **Open backups folder** в диалоге восстановления профиля или откройте каталог данных вручную.

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
- **Read-only mode**: если каталог данных недоступен для записи, появляется баннер «Read-only safeguard».
  - Разблокируйте доступ или выберите альтернативный путь, затем перезапустите приложение.
  - Пока режим активен, управление автозапуском и логами заблокировано.
- **View instructions**: кнопка открывает раздел quickstart (#troubleshooting) в системном браузере. В десктопной сборке используется tauri-plugin-opener, в браузере ссылка открывается в новой вкладке.
- Global hotkey conflicts: see **Settings → Hotkeys**; reassign or disable conflicting bindings.
- Missing tray icon on Linux: ensure `libayatana-appindicator3` installed; fallback UI enabled otherwise.
- Accessibility prompts on macOS: enable permissions under **System Settings → Privacy & Security → Accessibility**.
