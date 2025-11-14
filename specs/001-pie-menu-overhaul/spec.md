# Feature Specification: Pie Menu Complete Redesign and Overhaul

**Feature Branch**: `[001-pie-menu-overhaul]`
**Created**: 2025-11-14
**Status**: Draft
**Input**: User description: "1. Полная переработка Pie Menu: - Реализовать красивый и удобный интерфейс Pie Menu по аналогии с Kando - Обеспечить плавную и быстру. анимацию открытия/закрытия меню а также сделать функкию включение и выключение анимаций - Добавить настраиваемые визуальные стили (цвета, размеры, прозрачность) - Реализовать интуитивно понятное управление (перетаскивание, масштабирование) 2. Улучшение функционала Slices: - Переработать систему добавления и управления Slices - Добавить понятные подсказки о назначении каждого Slice - Реализовать визуальное отображение назначенных функций - Обеспечить возможность быстрого редактирования свойств Slice 3. Система профилей: - Реализовать многопрофильную систему как в Kando - Добавить возможность создания неограниченного количества Pie Menu - Обеспечить привязку профилей к конкретным приложениям - Добавить функцию удаления профилей - Упростить интерфейс управления профилями 4. Улучшение Context Conditions: - Реализовать интуитивно понятный интерфейс добавления правил - Добавить функцию автоматического определения приложений (5-секундный таймер) - Обеспечить визуальное отображение активных правил - Упростить процесс создания и редактирования условий 5. Переработка Hotkey Registration: - Оно вообще не нужен 6. Раздел Actions: - Реализовать систему пользовательских команд - Обеспечить возможность создания неограниченного количества действий - Добавить интерфейс для настройки сложных сценариев - Предоставить примеры использования 7. Улучшение Export/Update: - Переработать интерфейс экспорта профилей - Добавить автоматическую проверку обновлений - Реализовать встроенный механизм обновления (без ручного скачивания) - Улучшить визуальное оформление этих разделов 8. Open Log: - Реализовать удобный просмотр логов - Добавить фильтрацию и поиск по логам - Улучшить визуальное оформление 9. Общий интерфейс: - Полностью переработать UI/UX - Обеспечить профессиональный и современный дизайн - Добавить единый стиль всех элементов - Оптимизировать навигацию между разделами - Реализовать адаптивный интерфейс Ты смотри проект AutoHotPiehttps-main и kando-2.1.0-beta.1-main и сделай такой же проект дизайн бери у kando а функций бери у AutoHotPiehttps-main"

## Clarifications

### Session 2025-11-14

- Q: What is the maximum number of slices allowed per pie menu? → A: Allow between 2 and 12 slices per level, with maximum nesting depth of 3 levels to maintain usability.
- Q: How to handle slice functionality prioritization in UI? → A: Implement a drag-and-drop interface for slice ordering with visual feedback for assigned actions.
- Q: What level of customization needed for visual styles? → A: Support color themes, size adjustments (50-200% of base size), transparency levels, and font options similar to Kando's system.

### Session 2025-11-14 (Clarifications)

- Q: How can "professional modern design" be quantified with specific measurable visual criteria? → A: Define using Inter typography (400/600 weights), 8px spacing grid, high contrast ratio >7:1, accent color #35B1FF on #111111 background, edge radius 4px, subtle shadows (0 2px 4px rgba(0,0,0,0.3)).
- Q: Is "Kando-inspired design" defined with specific visual references and metrics for measurable assessment? → A: Reference Kando's design system: radial menu center core diameter 80px, slice angle 30° min, hover scale 1.15x, animation curve ease-in-out, color palette #111111/#35B1FF/#FFFFFF, icon size 24px in center.
- Q: What are the specific timing and easing parameters for "smooth animation"? → A: Opening/closing duration 300ms with ease-in-out cubic-bezier(0.4,0,0.2,1), scale transform from 0.8 to 1.0, fade-in transparency 0 to 1, hover scale adicional 1.0 to 1.15 over 150ms.
- Q: How is "intuitive controls" defined with specific interaction patterns beyond dragging and scaling? → A: Include context menus on right-click, keyboard shortcuts (arrows for navigation, enter for select, escape for close), gesture support (tap, hold, swipe), visual feedback (tooltips on hover 300ms delay, progress bars for long actions).
- Q: Can the three-second user goal be broken into specific response time targets? → A: Hotkey recognition <100ms, menu rendering <200ms, action execution <800ms per step, total sequence <3000ms with loading states shown for actions >500ms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Display redesigned pie menu with smooth animations (Priority: P1)

Как пользователь хочу вызывать переработанное pie меню с плавной анимацией открытия/закрытия и возможностью включения/выключения анимаций, чтобы меню выглядело современно и профессионально как в Kando, но сохраняло функциональность AutoHotPie.

**Why this priority**: Pie меню — центральный элемент приложения; без привлекательного интерфейса пользователи не будут его использовать.

**Independent Test**: Можно протестировать вызов меню, проверку анимаций открытия/закрытия, настройку включения/выключения анимаций и визуальное сходство с Kando.

**Acceptance Scenarios**:

1. **Given** профиль активен, **When** пользователь нажимает хоткей, **Then** pie меню открывается с плавной анимацией (ease-in-out 300ms) в стиле Kando.
2. **Given** анимации отключены в настройках, **When** пользователь вызывает меню, **Then** меню появляется мгновенно без анимаций.
3. **Given** визуальные стили настроены (цвета, размеры), **When** меню открывается, **Then** стили применяются корректно к сегментам и центру.

---

### User Story 2 - Manage slices with visual editing (Priority: P1)

Как пользователь хочу удобно добавлять, редактировать slices с визуальными подсказками и перетаскиванием, чтобы быстро настроить меню без сложности AutoHotPie.

**Why this priority**: Управление slices — основа функциональности; без интуитивного интерфейса настройка будет мучительной.

**Independent Test**: Можно протестировать создание slice, назначение действия, визуальное отображение, редактирование свойств и удаление.

**Acceptance Scenarios**:

1. **Given** редактор slices открыт, **When** пользователь добавляет новый slice, **Then** появляются подсказки о назначении функций и visual отображение.
2. **Given** slice создан, **When** пользователь редактирует свойства, **Then** изменения сразу визуализируются и сохраняются.
3. **Given** slices размещены, **When** пользователь перетаскивает, **Then** порядок меняется с live preview.

---

### User Story 3 - Handle multiple profiles with app binding (Priority: P2)

Как пользователь с разными задачами хочу создавать неограниченное количество профилей и привязывать их к приложениям, чтобы меню адаптировалось к контексту как в Kando.

**Why this priority**: Многопрофильность позволяет гибкость использования; без неё продукт ограничен одним сценарием.

**Independent Test**: Можно протестировать создание/удаление профилей, привязку к приложениям, переключение профилей и сохранение настроек.

**Acceptance Scenarios**:

1. **Given** нет профилей, **When** пользователь создаёт новый, **Then** профиль добавляется в список с настройками.
2. **Given** профили существуют, **When** пользователь привязывает профиль к приложению, **Then** меню активируется только в этом контексте.
3. **Given** профиль выбран для удаления, **When** пользователь подтверждает, **Then** профиль удаляется с сохранением резервных копий.

---

### User Story 4 - Configure context conditions intuitively (Priority: P2)

Как пользователь хочу легко добавлять правила активации с автоматическим определением приложений, чтобы условия работали без сложной настройки.

**Why this priority**: Контекстные правила — ключ к автоматизации; без простого интерфейса функция бесполезна.

**Independent Test**: Можно протестировать добавление правила, автоопределение приложений (5-секундный таймер), визуальное отображение активных правил.

**Acceptance Scenarios**:

1. **Given** раздел Context Conditions открыт, **When** пользователь нажимает "Добавить правило", **Then** открывается интуитивный интерфейс с опциями.
2. **Given** автоопределение активно, **When** пользователь фокусируется на приложение 5 секунд, **Then** правило создаётся автоматически.
3. **Given** правила активны, **When** пользователь переключает приложения, **Then** визуальное отображение показывает активные правила.

---

### User Story 5 - Remove hotkey registration completely (Priority: P3)

Как пользователь хочу, чтобы hotkey registration был полностью удалён, поскольку он не нужен в новом дизайне.

**Why this priority**: Удаление ненужных функций упрощает интерфейс; оставление запутывает пользователей.

**Independent Test**: Проверить отсутствие раздела hotkey registration в UI и настройках.

---

### User Story 6 - Manage custom actions and scenarios (Priority: P2)

Как пользователь хочу создавать неограниченное количество действий и сложных сценариев с примерами использования, чтобы автоматизировать рутинные задачи.

**Why this priority**: Система действий — ядро функциональности; без неё меню бесполезно.

**Independent Test**: Можно протестировать создание действия, настройку сценариев, запуск и использование предоставленных примеров.

**Acceptance Scenarios**:

1. **Given** раздел Actions открыт, **When** пользователь создаёт новое действие, **Then** интерфейс позволяет настроить сложные сценарии.
2. **Given** действия созданы, **When** пользователь выбирает пример, **Then** сопровождается описанием использования.
3. **Given** действие запущено, **When** сценарий завершается, **Then** предоставляется отчёт о выполнении.

---

### User Story 7 - Export profiles and manage updates automatically (Priority: P3)

Как пользователь хочу удобный экспорт, автоматическую проверку и встроенное обновление, чтобы поддерживать приложение в актуальном состоянии без ручных действий.

**Why this priority**: Обновления и экспорт повышают usability; отсутствие приводит к устареванию и потере данных.

**Independent Test**: Проверить экспорт профилей, автопроверку обновлений, встроенное обновление и визуальное оформление.

**Acceptance Scenarios**:

1. **Given** профили настроены, **When** пользователь экспортирует, **Then** создаётся файл с улучшенным интерфейсом.
2. **Given** обновление доступно, **When** автопроверка срабатывает, **Then** появляется уведомление о встроенном обновлении.
3. **Given** обновление запущено, **When** без ручного скачивания, **Then** приложение обновляется автоматически.

---

### User Story 8 - View logs with filtering and search (Priority: P3)

Как разработчик/пользователь хочу удобный просмотр логов с фильтрацией и поиском, чтобы быстро находить информацию и проблемы.

**Why this priority**: Логи критично для отладки; без удобного интерфейса diagnostics невозможна.

**Independent Test**: Проверить открытие логов, фильтрацию по уровню, поиск по содержимому и визуальное оформление.

**Acceptance Scenarios**:

1. **Given** раздел Log открыт, **When** пользователь фильтрует по уровню, **Then** отображаются только соответствующие записи.
2. **Given** логи открыты, **When** пользователь ищет по строке, **Then** highlights результаты.
3. **Given** лог большой, **When** пользователь просматривает, **Then** современное визуальное оформление улучшает readability.

---

### User Story 9 - Navigate modern unified UI/UX (Priority: P1)

Как пользователь хочу полностью переработанный интерфейс в стиле Kando, адаптивный и единый, чтобы комфортно настраивать и использовать приложение.

**Why this priority**: UI/UX — основа user experience; плохой дизайн отпугивает пользователей.

**Independent Test**: Проверить навигацию между разделами, адаптивность, единый стиль объектов и профессиональный дизайн.

**Acceptance Scenarios**:

1. **Given** приложение запущено, **When** пользователь переходит между разделами, **Then** навигация оптимизирована без задержек.
2. **Given** UI открыт на разных устройствах, **When** масштабируется, **Then** адаптивный дизайн сохраняет usability.
3. **Given** элементы интерфейса, **When** отображаются, **Then** единый стиль и современный дизайн в духе Kando.

### Edge Cases

- Что происходит, если анимации вызывают performance issues? Пользователь может отключить их в настройках.
- Как обрабатывается удаление профиля с привязками? Предупреждение и предложение переназначить.
- Что если автоопределение приложений не работает на некоторых системах? Fallback к ручному вводу.
- Как обрабатываются конфликты условий контекста? Prioritization по порядку создания с пользовательским контролем.
- Что при отсутствии обновлений для встроенного механизма? Отображение статуса и manual download option.
- Как логи ведут себя при отсутствии прав записи? Error message with открытием альтернативного viewer.
- Что если адаптивный интерфейс на очень маленьких экранах? Minimum scale limitations с предупреждениями.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Система ДОЛЖНА предоставлять переработанный интерфейс Pie Menu с визуальным сходством с Kando (радиальный design, темы, анимации).
- **FR-002**: Pie Menu ДОЛЖНО поддерживать настраиваемые стили: цвета, размеры (50-200%), прозрачность, фонты.
- **FR-003**: Система ДОЛЖНА реализовывать плавные анимации открытия/закрытия с функцией включения/выключения (ease-in-out, 300ms default).
- **FR-004**: UI ДОЛЖЕН предоставлять интуитивное управление: перетаскивание slices, масштабирование меню, визуальное editing.
- **FR-005**: Система slices ДОЛЖНА позволять добавление с подсказками, визуальным отображением функций, быстрым редактированием свойств.
- **FR-006**: Многопрофильная система как в Kando ДОЛЖНА поддерживать неограниченное количество профилей с привязкой к приложениям.
- **FR-007**: Профили ДОЛЖНЫ позволять создание, удаление, переключение с упрощённым интерфейсом управления.
- **FR-008**: Context Conditions ДОЛЖНЫ иметь интуитивный interface добавления правил, автоопределение приложений (5-секундный timer), визуальное отображение активных.
- **FR-009**: Hotkey Registration раздел ДОЛЖЕН быть полностью удалён как не нужный.
- **FR-010**: Раздел Actions ДОЛЖЕН поддерживать систему пользовательских команд, неограниченное количество действий, интерфейс сложных сценариев, примеры использования.
- **FR-011**: Export/Update ДОЛЖНЫ иметь переработанный interface экспорта, автопроверку обновлений, встроенный механизм обновления без manual downloads, улучшенное визуальное оформление.
- **FR-012**: Open Log ДОЛЖЕН предоставлять удобный просмотр с фильтрацией по уровню, поиском по содержимому, улучшенным визуальным оформлением.
- **FR-013**: Общий UI/UX ДОЛЖЕН быть полностью переработан в стиле Kando: professional design, unified style элементов, optimized navigation, adaptive interface.
- **FR-014**: Функциональность ДОЛЖНА брать inspiration из AutoHotPiehttps-main для добавления slices, управления профилями, Actions, но design от kando-2.1.0-beta.1-main.

### Non-Functional Requirements

- **NFR-001**: Время открытия pie меню: hotkey recognition <100ms, menu rendering <200ms, action execution <800ms per step, total sequence <3000ms with loading states shown for actions >500ms (измеряется на стандартных системах).
- **NFR-002**: UI frames per second не опускается ниже 30 при активных анимациях и визуальном editing.
- **NFR-003**: Поддержка всех функций на Windows, macOS, Linux без platform-specific issues.
- **NFR-004**: Responsive design с minimum width 800px, adaptable to high-DPI displays.
- **NFR-005**: Localization support для минимум 10 языков, включая русский, со строками из AutoHotPie и Kando locales.

### Key Entities *(include if feature involves data)*

- **Profile**: `{ id: Uuid, name: string, description?: string, boundApps: string[], pieMenus: PieMenu[], settings: ProfileSettings, createdAt: DateTime }`.
- **PieMenu**: `{ id: Uuid, name: string, slices: Slice[], style: MenuStyle, animationEnabled: bool, scale: f32 }`.
- **Slice**: `{ id: Uuid, label: string, tooltip?: string, icon?: IconReference, action: ActionRef, hotkey?: Hotkey, position: u8 }`.
- **Action**: `{ id: Uuid, name: string, type: ActionType, config: ActionConfig, examples: string[], tags: string[] }`.
- **ContextCondition**: `{ id: Uuid, appPatterns: string[], rules: ContextRule[], visualIndicator: bool, autoDetectEnabled: bool }`.
- **LogEntry**: `{ timestamp: DateTime, level: LogLevel, message: string, filterTags: string[] }`.
- **StyleTheme**: `{ colors: ColorMap, fonts: FontSettings, transparency: f32, sizeMultiplier: f32 }`.

## UI/UX Specification

### Application Surfaces

- **Main Window**: Borderless design similar to Kando, with left sidebar navigation (Menu, Profiles, Slices, Actions, Context, Export/Update, Logs, Settings), right content area, top breadcrumbs and status bar.
- **Pie Menu**: Radial design with center core, configurable slices (2-12), concentric rings for nesting, animations toggle, scale/position controls.
- **Settings Panel**: Organized tabs (Appearance, Behavior, System), consistent with Kando's settings style.

### Pie Menu Visuals & Interaction

- **Structure**: Central core diameter 80px with profile name, surrounding slices with minimum 30° angle, optional nested levels as rings.
- **Theme**: Dark theme inspired by Kando - background #111111, accent #35B1FF on white/grey text, high contrast ratio >7:1, Inter 400/600 weights, 8px spacing grid, 4px edge radius, subtle shadows (0 2px 4px rgba(0,0,0,0.3)).
- **Interactions**: Drag to scale/position menu, slices for reordering/editing via drag-drop, context menus on right-click, keyboard navigation (arrows, enter, escape), gesture support (tap, hold, swipe), visual feedback (tooltips on hover 300ms delay, progress bars for long actions), toggle animations.
- **Animations**: Opening/closing duration 300ms with ease-in-out cubic-bezier(0.4,0,0.2,1), scale transform from 0.8 to 1.0, fade-in transparency 0 to 1, hover scale 1.0 to 1.15 over 150ms.
- **Status Indicators**: Success toasts, error highlighting, action previews.

### Slices Management

- **Add/Edit Interface**: Modal/panel with preview, tooltips for function assignment, drag-drop for ordering, quick property panel (icon, label, action).
- **Visual Display**: Color-coded by function type, status icons for completion, inline editing.

### Profiles System

- **Dashboard**: Grid of cards with mini previews, status indicators (active, bound), actions (switch, edit, delete, export).
- **Creation/Editing**: Wizard interface for name/binding/ initial slices, simplified setup.

### Context Conditions

- **Rule Builder**: Drag-drop for conditions, 5-second auto-detect with progress bar, visual rule chain display.
- **Visualization**: Active rules highlight in status bar, conflict warnings.

### Actions Builder

- **Command Interface**: Script-like editor with blocks for actions, macro recorder, example gallery from AutoHotPie.
- **Testing**: Live run with output preview, validation feedback.

### Export/Update

- **Export Panel**: Drag-drop JSON generation, profile selection, visual progress.
- **Update Manager**: Background check every 6 hours, in-app install button, changelog viewing.

### Logs

- **Viewer**: Table with columns (time, level, message), filters/search bar, auto-refresh toggle.
- **Formatting**: Color-coded levels, expandable details, export options.

### Overall Design

- **Modern Style**: Minimalist, clean lines, high contrast, icon-first navigation like Kando.
- **Accessibility**: High-contrast mode, keyboard navigation, screen reader support.
- **Responsiveness**: Collapsible sidebar, scalable elements, min-width handling.

### Assumptions & Constraints

- Target platforms: Windows 10+, macOS 12+, Linux with modern desktop environments.
- Function allocation from AutoHotPie allows direct porting of slice actions and scenario examples.
- Design follows Kando's color schemes and layout principles exactly.
- Unlimited profiles/actions only constrained by system memory (max 1000 each).
- Auto-detect requires platform permissions for process/window reading.
- Updates via GitHub releases, requires internet for checks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% пользователей запускают pie меню и выполняют действия менее чем за 3 секунды от хоткея.
- **SC-002**: Визуальное сходство с Kando оценивается в 8/10 или выше 90% тестеров.
- **SC-003**: Создание и редактирование slices занимает менее 30 секунд для среднего профиля (5 slices).
- **SC-004**: Управление профилями (создание/удаление/привязка) завершается успешно в 100% тестов.
- **SC-005**: Context conditions правильно активируют профили в 98% случаев на стандартных приложениях.
- **SC-006**: Actions система позволяет создать неограниченное количество команд без снижения性能.
- **SC-007**: Export/update функционирует без ошибок и предоставляет seamless experience в 100% случаев.
- **SC-008**: Logs просмотр позволяет найти нужную информацию менее чем за 10 секунд.
- **SC-009**: Общий UI/UX получает оценку usability выше 4.5/5 от 90% пользователей.
