# Cleanup Control Contract

## Overview
Операции описывают ожидаемые действия внутренних скриптов/утилит, которые автоматизируют очистку Linux/macOS артефактов. Контракт служит основой для CLI/PowerShell модулей, используемых в планируемой реализации.

---

## Operation: `scanPlatformArtifacts`
- **Purpose**: Просканировать репозиторий на наличие упоминаний Linux/macOS.
- **Request**:
  - `paths: string[]` — каталоги для обхода.
  - `patterns: string[]` — ключевые слова или маски (`linux`, `macos`, `*.desktop`).
  - `exclude: string[]` — исключённые пути (например, `CHANGELOG`).
- **Response**:
  - `artifacts: PlatformArtifact[]` — см. data-model.
  - `summary: { total: number; byType: Record<string, number>; byPlatform: Record<string, number> }`.
- **Errors**:
  - `INVALID_PATTERN` — передан пустой список ключей.
  - `SCAN_FAILED` — ошибка чтения файлов.

## Operation: `rewriteCodePath`
- **Purpose**: Удалить cfg/платформенные ветки и сохранить только Windows-реализацию.
- **Request**:
  - `modulePath: string`.
  - `strategy: "delete" | "replace"`.
  - `notes?: string` — пояснения к применённым Win32 API.
- **Response**:
  - `status: "pending" | "updated"`.
  - `diffPreview: string` — агрегированный diff (опционально).
- **Errors**:
  - `MODULE_NOT_FOUND`.
  - `WINDOWS_PATH_MISSING` — если нет корректной замены.

## Operation: `pruneDependencies`
- **Purpose**: Очистить Cargo/npm/tauri конфиги от платформенных пакетов.
- **Request**:
  - `manifests: string[]` — файлы (`Cargo.toml`, `package.json`, `tauri.conf.json5`).
  - `allowList?: string[]` — зависимости, которые должны остаться.
- **Response**:
  - `removed: string[]` — удалённые зависимости.
  - `remaining: string[]` — итоговый список.
- **Errors**:
  - `DEPENDENCY_IN_USE` — пакет всё ещё требуется и не может быть удалён.

## Operation: `updateTestMatrix`
- **Purpose**: Сократить тестовые конфиги до Windows.
- **Request**:
  - `playwrightConfig: string`.
  - `projectsToKeep: string[]` (например, `windows-chromium`).
  - `snapshotsDir: string`.
- **Response**:
  - `removedProjects: string[]`.
  - `regeneratedSnapshots: string[]`.
- **Errors**:
  - `PROJECT_NOT_FOUND` — указанный проект отсутствует.

## Operation: `verifyWindowsOnly`
- **Purpose**: Запустить финальные проверки (cargo/pnpm/playwright/rg).
- **Request**:
  - `commands: string[]` — список команд в порядке выполнения.
- **Response**:
  - `runs: VerificationRun[]` (см. data-model).
  - `overallStatus: "pass" | "fail"`.
- **Errors**:
  - `COMMAND_FAILED` — одна из команд завершилась с ненулевым кодом.

---

### Shared Types
```ts
type PlatformArtifact = {
  path: string;
  platform: 'linux' | 'macos' | 'dual';
  artifactType: 'source' | 'script' | 'config' | 'doc' | 'test' | 'asset';
  removalStatus: 'pending' | 'removed' | 'whitelisted';
  removalMethod: 'delete' | 'rewrite' | 'replace';
  owner: string;
  notes?: string;
};

type VerificationRun = {
  id: string;
  commands: string[];
  result: 'pass' | 'fail';
  logPath?: string;
  timestamp: string;
};
```
