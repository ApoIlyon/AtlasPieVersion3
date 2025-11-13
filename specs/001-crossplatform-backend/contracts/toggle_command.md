# Contract: toggle_pie_menu Command

## Purpose
Переключает состояние pie-overlay окна в Tauri приложении (показ/скрытие) на основе платформенного backend.

## IPC Signature
- **Command Name**: `toggle_pie_menu`
- **Input**: Пустой объект `{}`
- **Output**:
  ```json
  {
    "state": "shown" | "hidden",
    "backend": "Windows" | "X11" | "GnomeWayland" | "KdeWayland" | "Stub",
    "position": { "x": number, "y": number } | null,
    "message": string | null
  }
  ```
- **Errors**:
  - `BackendUnavailable` — активная платформа не поддерживает показ меню (заглушка).
  - `OverlayError` — ошибка при показе/скрытии окна (детали в `message`).
  - `AppNotReady` — окно overlay ещё не инициализировано.

## CLI Interface
- **Command**: `autohotpie-tauri --toggle`
- **Behavior**:
  1. Попытка IPC к работающему приложению.
  2. В случае успеха возвращает JSON аналогичный IPC `output`.
  3. При отсутствии активного экземпляра завершает выполнение с кодом 1 и текстом: `AutohotPie is not running. Start the app before using --toggle.`

## Events
- **Event Name**: `pie-menu:state-changed`
- **Payload**: Совпадает с `output` структуры (state, backend, position, message).
- **Subscriber**: Фронтенд React (обновляет UI состояния меню).

## Acceptance Criteria
1. Команда `toggle_pie_menu` возвращает `state:"shown"` при первом вызове, если окно было скрыто.
2. Повторный вызов возвращает `state:"hidden"` и закрывает окно.
3. В WindowsBackend координаты соответствуют положению курсора; в заглушках — `null`, а фронтенд использует центр экрана.
4. CLI `--toggle` отражает те же результаты, что и IPC, и корректно сообщает об ошибке отсутствия демона.
