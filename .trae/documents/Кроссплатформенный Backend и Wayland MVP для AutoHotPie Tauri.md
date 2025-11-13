## Цели
- Ввести абстракцию `Backend` и диспетчер платформ.
- Реализовать MVP для Wayland: команда `toggle_pie_menu`, позиция курсора, показ/скрытие оверлея.
- Добавить CLI `--toggle` с IPC к работающему экземпляру.
- Перенести глобальный хоткей во фронтенде на IPC-вызов `toggle_pie_menu`.
- Описать окно `pie-overlay` и подготовить пользовательскую документацию.

## Архитектура Backend
1. Структура: `src-tauri/src/backend/`
   - `mod.rs`: трейт `Backend` с методами: `bind_global_shortcut(id, accelerator)`, `unbind_global_shortcut(id)`, `on_shortcut(id, handler)`, `get_pointer_position() -> (x, y)`, `show_menu_at(x, y)`, `hide_menu()`.
   - Платформы: `windows.rs`, `x11.rs`, `gnome_wayland.rs`, `kde_wayland.rs`, `unsupported.rs` (возвращают `Unsupported/Stub`).
   - Диспетчер: `resolve_backend()` с `cfg(target_os)`/`cfg(feature)`.
2. Связка с существующим кодом:
   - Windows: использовать `tauri-plugin-global-shortcut` и текущую логику команд хоткеев (`autohotpie-tauri/src-tauri/src/lib.rs`, плагин подключён; команды: `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`).
   - Получение позиции: обёртка над `window.cursor_position()` (доступно в `autohotpie-tauri/src-tauri/src/services/window_info.rs:59-64`, типы — `system_status.rs`).
   - Показ/скрытие: использовать `pie_overlay::{show, hide, ensure_window}` (`autohotpie-tauri/src-tauri/src/services/pie_overlay.rs`, центрирование сейчас через `window.center()` — `pie_overlay.rs:270`).
   - Wayland/X11: пока `Stub` (позиция курсора — `None` → центр экрана, хоткеи — не поддержаны).

## Команда `toggle_pie_menu`
- Место: `src-tauri/src/commands/toggle.rs` + регистрация в `lib.rs`.
- Логика:
  - Через диспетчер получить `Backend`.
  - Попробовать `get_pointer_position()`. Если `Unsupported`, вычислить центр активного экрана.
  - Если окно оверлея скрыто — `show_menu_at(x, y)`; иначе — `hide_menu()`.
- Фиксация состояния окна: использовать стор `PieOverlayStore` (готов в `pie_overlay.rs`).

## CLI `--toggle` и IPC
- Добавить CLI-путь: `autohotpie-tauri --toggle` (обработка в `main.rs` или `lib.rs` парсинг аргументов).
- IPC (простой и безопасный):
  - Сервер в основном процессе: слушает локальный TCP `127.0.0.1:<port>` или UDS/Named Pipe; хранит ephemeral токен (файл в `app_dir`).
  - Клиент при `--toggle`: читает токен и отправляет "toggle"; сервер вызывает `toggle_pie_menu`.
  - Реализация: `tauri::async_runtime::spawn` для сервера, без блокировок главного потока.
- Альтернатива для MVP: если сервер недоступен, запустить приложение и выполнить локально `toggle_pie_menu`.

## Pie Overlay окно
- Конфиг `tauri.conf.json` (`autohotpie-tauri/src-tauri/tauri.conf.json`): добавить второе окно `pie-overlay`:
  - `transparent: true`, `decorations: false`, `always_on_top: true`, `visible: false` (по умолчанию), `skip_taskbar: true`.
- Бэкенд-методы:
  - `show_menu_at(x, y)`: `ensure_window(...)` → позиционирование.
    - Windows/X11: `window.set_position(PhysicalPosition { x, y })` перед `show()`.
    - Wayland: если позиционирование недоступно, оставить центрирование (`window.center()` или фронтенд-центрирование).
  - `hide_menu()`: как в `pie_overlay::hide`.
- Учесть существующую реализацию: сейчас окно создаётся программно (`pie_overlay.rs`), конфиг лучше сделать источником истинности, но совместимым с динамической подстройкой.

## Фронтенд: замена локального слушателя
- Файл: `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts` (открыт в IDE).
- Изменения:
  - Убрать зависимость от события `hotkeys://trigger` как первичного механизма.
  - Вызов `invoke('toggle_pie_menu')` из хука/компонента, когда требуется активация (Windows — вызывать из обработчика плагинного хоткея; Wayland/X11 — пользователи настраивают системный шорткат, который запускает `--toggle`).
  - Сохранить синхронизацию состояния оверлея: `pie_overlay_ready`, `pie_overlay_sync_state`, события `pie-overlay://state` остаются без изменений.

## Верификация
- Юнит/интеграционные тесты Rust (по мере возможности):
  - Тест диспетчера `resolve_backend()` по `cfg(target_os)`.
  - Тест `toggle_pie_menu` с заглушкой бэкенда: проверка переходов видимости.
- Ручная проверка:
  - Windows: глобальный шорткат через текущий плагин → меню открывается/закрывается.
  - Wayland (GNOME/KDE/Hyprland): системный шорткат, запускающий `--toggle` → меню центрируется и отображается.

## Документация: Wayland setup
- GNOME: системный шорткат/расширение, вызывающее `autohotpie-tauri --toggle` (или D-Bus).
- KDE: глобальный шорткат в System Settings, запускающий `--toggle` или D-Bus.
- Hyprland/Niri: в конфиге: `bind = $mod, key, exec, autohotpie-tauri --toggle`.
- Пояснение: приложение работает как демон + прозрачное окно; глобальный хоткей настраивается пользователем в DE.

## План расширения
- GNOME: отдельное расширение, слушает хоткей и дергает D-Bus (метод `toggle`).
- KDE: портал `global-shortcuts` или KWin-скрипт, вызывает Tauri-команду.
- wlroots/Hyprland/Niri: использовать их протоколы/CLI.
- X11: полноценный backend (глобальные хоткеи, позиция курсора через XLib/XCB).
- Перенос ввода (мышь/клавиатура) в backend, унификация фронтенда.

## Карта изменений по файлам
- `autohotpie-tauri/src-tauri/src/backend/mod.rs` (+ платформенные файлы).
- `autohotpie-tauri/src-tauri/src/commands/toggle.rs` и регистрация в `lib.rs`.
- `autohotpie-tauri/src-tauri/src/lib.rs`: подключение IPC сервера; `generate_handler!` добавить `toggle_pie_menu`.
- `autohotpie-tauri/src-tauri/src/main.rs`: разбор CLI `--toggle`.
- `autohotpie-tauri/src-tauri/tauri.conf.json`: окно `pie-overlay`.
- `autohotpie-tauri/src-tauri/src/services/pie_overlay.rs`: позиционирование при показе.
- `autohotpie-tauri/src/hooks/usePieMenuHotkey.ts`: вызов `invoke('toggle_pie_menu')` вместо локального слушателя.

## Ссылки на текущий код
- Плагин хоткеев: `autohotpie-tauri/src-tauri/src/lib.rs` (подключение `tauri-plugin-global-shortcut`).
- Команды хоткеев: `autohotpie-tauri/src-tauri/src/commands/hotkeys.rs`.
- Позиция курсора: `autohotpie-tauri/src-tauri/src/services/window_info.rs:59-64`; типы: `src-tauri/src/services/system_status.rs:27-30`.
- Окно оверлея: центрирование `autohotpie-tauri/src-tauri/src/services/pie_overlay.rs:270`; показ/скрытие — тот же файл.
- Фронтенд оверлея: `autohotpie-tauri/src/pie-overlay/main.tsx`.

Вы подтвердите план — приступлю к реализации по шагам, с проверкой поведения на Windows и Wayland.