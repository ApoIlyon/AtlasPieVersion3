# Data Model: Cross-Platform Backend Architecture

## Entities

### Backend
- **Description**: Интерфейс платформенной реализации операций хоткеев и отображения pie-меню.
- **Fields / Methods**:
  - `fn bind_global_shortcut(id: ShortcutId, accelerator: Accelerator) -> Result<()>`
  - `fn unbind_global_shortcut(id: ShortcutId) -> Result<()>`
  - `fn on_shortcut<F>(&self, handler: F)` (регистрирует callback)
  - `fn get_pointer_position() -> Result<Option<Point>>`
  - `fn show_menu_at(point: Point) -> Result<()>`
  - `fn hide_menu() -> Result<()>`
  - `fn platform_kind() -> BackendKind`
- **Relationships**: Инициализируется и управляется `BackendDispatcher`.

### BackendDispatcher
- **Description**: Фасад над выбором конкретной реализации Backend.
- **Fields**:
  - `active_backend: Arc<dyn Backend>`
  - `fallback_backend: Arc<dyn Backend>`
  - `platform: BackendKind`
- **Relationships**:
  - Использует системную информацию (OS, окружение Wayland/X11) для выбора backend.
  - Предоставляет `Arc<dyn Backend>` сервисам приложения.

### PieOverlayWindow
- **Description**: Прозрачное окно Tauri, визуализирующее pie меню.
- **Fields**:
  - `window_handle: tauri::Window`
  - `visible: bool`
  - `last_position: Option<Point>`
- **Relationships**:
  - Управляется backend через сервис `pie_overlay`.
  - Получает координаты от backend для позиционирования.

### ToggleInvocation
- **Description**: Запрос на переключение состояния pie-меню.
- **Fields**:
  - `source: ToggleSource` (IPC, CLI, тест)
  - `timestamp: DateTime`
  - `desired_state: ToggleState` (auto определяется по текущему состоянию)
- **Relationships**:
  - Обрабатывается backend командой `toggle_pie_menu`.

### ShortcutBinding
- **Description**: Связь идентификатора хоткея с платформенно-зависимой регистрацией.
- **Fields**:
  - `id: ShortcutId`
  - `accelerator: Accelerator`
  - `scope: BindingScope` (глобальный, сессия)
  - `active: bool`
- **Relationships**:
  - Создаётся WindowsBackend, для Wayland/X11 хранит состояние заглушки.

## Supporting Types

- **Point**: `(x: f64, y: f64)` в координатах экрана.
- **BackendKind**: Enum (`Windows`, `X11`, `GnomeWayland`, `KdeWayland`, `OtherWayland`, `Stub`).
- **ToggleSource**: Enum (`IPC`, `CLI`, `FrontendFallback`).
- **ToggleState**: Enum (`Show`, `Hide`).
- **ShortcutId**: String или UUID, уникальный идентификатор привязки.
- **Accelerator**: Структура с модификаторами (`ctrl`, `alt`, `shift`, `meta`) и основной клавишей.
- **BindingScope**: Enum (`Application`, `System`).

## State Transitions

1. **Toggle Flow**
   - `Hide → Show`: При `toggle_pie_menu`, если `PieOverlayWindow.visible == false`, backend получает позицию курсора или центр экрана и вызывает `show_menu_at`.
   - `Show → Hide`: Повторный `toggle_pie_menu` вызывает `hide_menu` и обновляет `visible = false`.

2. **Shortcut Lifecycle**
   - `Unbound → Bound`: `bind_global_shortcut` успешен, обновляется `ShortcutBinding.active = true`.
   - `Bound → Unbound`: `unbind_global_shortcut` вызывается при выходе или смене конфигурации.
   - `Bound → Stubbed`: На неподдерживаемых платформах возвращается ошибка, логируется в dispatcher, binding помечается как `Stub`.

## Validation Rules

- `ShortcutId` должен быть уникален в рамках приложения.
- `Accelerator` должен соответствовать допустимому синтаксису таури (`CommandOrControl+Shift+P` и т.п.).
- `Point` должен находиться в границах доступных дисплеев; иначе применяется fallback (центр основного дисплея).
- Stub backend обязан логировать попытки использования и возвращать понятные ошибки для фронтенда.
