# Implementation Plan: Cross-Platform Backend Architecture

**Branch**: `001-crossplatform-backend` | **Date**: 2025-11-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-crossplatform-backend/spec.md`

**Note**: Этот план сформирован по workflow `/speckit.plan`.

## Summary

Создать архитектуру бэкендов для Tauri-приложения AtlasPie, обеспечив Windows функциональность без регрессий и заложив Wayland/X11 MVP: трейт `Backend`, диспетчер выбора реализации, команда `toggle_pie_menu`, CLI `--toggle`, показ прозрачного окна `pie-overlay` и пользовательскую документацию.

## Technical Context

**Language/Version**: Rust 1.72+ (Tauri backend, editon 2021), TypeScript/React 18 (Vite)  
**Primary Dependencies**: `tauri` 1.x, `tauri-plugin-global-shortcut`, `tauri-plugin-cli`, React/TypeScript frontend, планируемые обёртки над Wayland/X11 (stub)  
**Storage**: Не используется (стейт в памяти процесса)  
**Testing**: `cargo test` для Rust модулей, Vite/React unit tests (Vitest) при необходимости  
**Target Platform**: Desktop Windows 10+, Linux (Wayland: GNOME/KDE/Hyprland/Niri; X11)  
**Project Type**: Desktop (Tauri backend + React frontend)  
**Performance Goals**: Показ/скрытие pie-overlay ≤ 200 мс (см. SC-001)  
**Constraints**: Нет встроенных Wayland глобальных хоткеев → внешняя настройка; требуется прозрачное always-on-top окно без мерцаний  
**Scale/Scope**: Один экземпляр приложения, пользователи рабочих столов (десятки тысяч); охват основных DE Wayland через документацию

## Constitution Check

*GATE:* Конституция не заполнена; обязательные принципы отсутствуют. Требуется зафиксировать, что текущий план временно опирается на спецификацию и общие практики. → **Gate Pass (условно)** с пометкой NEEDS_CLARIFICATION: «Требуется актуализировать constitution.md».

## Project Structure

### Documentation (this feature)

```text
specs/001-crossplatform-backend/
├── plan.md              # Текущий документ
├── research.md          # Выводы Phase 0
├── data-model.md        # Модель сущностей Phase 1
├── quickstart.md        # Пошаговый гайд по настройке
├── contracts/           # Контракты CLI/IPC/Backend API
└── tasks.md             # Будет создано /speckit.tasks
```

### Source Code (repository root)

```text
autohotpie-tauri/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── backend/
│   │   │   ├── mod.rs           # Backend trait + dispatcher (новое)
│   │   │   ├── windows.rs       # WindowsBackend с tauri-plugin-global-shortcut
│   │   │   ├── x11.rs           # Stub реализация
│   │   │   ├── gnome_wayland.rs # Stub реализация
│   │   │   └── kde_wayland.rs   # Stub реализация
│   │   ├── services/
│   │   │   └── pie_overlay.rs   # Управление окном overlay
│   │   └── cli/
│   │       └── toggle.rs        # Вызовы CLI/IPC
│   ├── tauri.conf.json          # Добавление окна pie-overlay
│   └── capabilities/
│       └── default.json         # Обновить разрешения, если нужно
└── src/
    ├── App.tsx
    ├── services/ipc.ts          # IPC вызовы toggle
    └── ...                      # Остальной фронтенд
```

**Structure Decision**: Расширяем имеющийся проект `autohotpie-tauri` добавлением модуля `backend` в `src-tauri/src`, отдельного CLI-модуля и конфигурации второго окна. Фронтенд React использует IPC-слой в `src/services`.

## Complexity Tracking

> Нет выявленных нарушений, требующих оправдания.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None_ | — | — |
