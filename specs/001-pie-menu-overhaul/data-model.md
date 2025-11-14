# Data Model: Pie Menu Complete Redesign and Overhaul

**Feature**: Pie Menu Complete Redesign and Overhaul
**Design Phase**: Phase 1
**Version**: 1.0
**Date**: 2025-11-14

## Overview

The data model supports a modular pie menu system with unlimited profiles, each containing customizable pie menus with slices linked to actions. Context conditions determine when profiles activate. The model prioritizes JSON serialization for export/import, with TypeScript interfaces for type safety in the Tauri app.

## Core Entities

### Profile

Represents a complete automation profile with associated pie menus and activation rules.

```typescript
interface Profile {
  id: Uuid; // Primary key, auto-generated
  name: string; // Display name, 1-100 chars, required
  description?: string; // Optional description, max 500 chars
  boundApps: string[]; // Array of app package/window class names for binding
  pieMenus: PieMenu[]; // Nested pie menu structures (validate max depth 3)
  settings: ProfileSettings; // UI behavior preferences
  createdAt: Date; // ISO 8601, set on creation
  updatedAt: Date; // ISO 8601, set on save
}

// Validation Rules:
- id: Must be unique across all profiles
- name: Trimmed, no leading/trailing spaces, lowercase alpha-numeric + hyphens
- boundApps: Max 50 apps per profile, case-sensitive
- pieMenus: Max 10 per profile due to UI complexity
```

**Relationships**:
- One-to-many: Profile → PieMenus
- One-to-many: Profile → ContextConditions (via boundApps)
- Many-to-many: Profile → Actions (through slices)

### PieMenu

Represents a radial menu with configurable slices and visual appearance.

```typescript
interface PieMenu {
  id: Uuid; // Primary key, auto-generated
  name: string; // Display name, 1-50 chars
  slices: Slice[]; // Array of slice configurations (2-12 elements)
  style: MenuStyle; // Visual theming settings
  animationEnabled: boolean; // Toggle animations on/off
  scale: number; // Scale multiplier (0.5-2.0, default 1.0)
  createdAt: Date;
}

// Validation Rules:
- slices: Length enforced server-side, rejects invalid configs
- scale: Clamped to prevent extreme values
```

**Relationships**:
- Many-to-one: PieMenu → Profile (multiple menus per profile allowed)
- One-to-many: PieMenu → Slices

### Slice

Individual segment in a pie menu representing one action or submenu.

```typescript
interface Slice {
  id: Uuid; // Primary key
  label: string; // Short label, 1-20 chars
  tooltip?: string; // Optional help text, max 200 chars
  icon?: IconReference; // Optional icon asset
  action: Action; // Linked action to execute
  hotkey?: HotkeyBinding; // Optional per-slice hotkey
  position: number; // Index 0-11, enforces no duplicates in menu
}

// Validation Rules:
- position: Unique within parent menu
- action: Referenced action must exist and be valid
- icon: If specified, asset must be accessible
```

**Relationships**:
- Many-to-one: Slice → PieMenu
- One-to-one: Slice → Action (direct embed for simplicity)
- Optional: Slice → IconAsset

### Action

Executable command or macro sequence supporting various automation types.

```typescript
interface Action {
  id: Uuid; // Primary key
  name: string; // Action name, 1-100 chars
  type: ActionType; // Enum: 'shell', 'keyboard', 'application', 'custom'
  config: ActionConfig; // Type-specific configuration
  examples: string[]; // Example use cases (max 5)
  tags: string[]; // Categorization tags (max 10)
  createdAt: Date;
}

// Enums & Types:
enum ActionType {
  Shell = 'shell',          // System command execution
  Keyboard = 'keyboard',    // Key sequence/macro
  Application = 'application', // Launch app/file
  Custom = 'custom'          // Complex scripted actions
}

type ActionConfig = ShellConfig | KeyboardConfig | AppConfig | CustomConfig;

// Examples:
interface ShellConfig {
  command: string; // Required, max 1000 chars
  args?: string[]; // Optional arguments array
  cwd?: string;    // Working directory
  timeout?: number; // Max execution time in ms
}

interface KeyboardConfig {
  keys: string[]; // Array of key codes in sequence
  delay?: number;  // Delay between keys (ms)
  Hold?: object;   // Modifier key press/release tracking
}

// Validation Rules:
- config: Type-specific validation (e.g., non-empty shell command)
- examples: Used for UI display, recommend user-friendly descriptions
- tags: Lowercase, normalized for search
```

**Relationships**:
- Many-to-many: Action → Profiles (through slices, but reusable across profiles)

### ContextCondition

Rules for profile activation based on application context.

```typescript
interface ContextCondition {
  id: Uuid; // Primary key
  appPatterns: string[]; // Regex patterns for app matching
  rules: ContextRule[];   // Array of condition rules
  visualIndicator: boolean; // Show active indicator in UI
  autoDetectEnabled: boolean; // Enable 5-second auto-detection
  priority: number; // Lower value = higher priority
}

// Condition types for flexible context matching
interface ContextRule {
  type: RuleType;        // 'process', 'window', 'region'
  pattern: string;       // Pattern to match (regex for complex)
  matchType: MatchType;  // 'exact', 'contains', 'regex'
  caseSensitive: boolean; // Pattern sensitivity
}

// Enums:
enum RuleType { Process = 'process', Window = 'window', Region = 'region' }
enum MatchType { Exact = 'exact', Contains = 'contains', Regex = 'regex' }

// Validation Rules:
- priority: 0-1000 range, lower wins conflicts
- patterns: Compiled regex validation if type 'regex'
- rules: Max 5 per condition to prevent complexity
```

**Relationships**:
- One-to-many: ContextCondition → Profile (linked via boundApps)

### LogEntry

System activity logging for diagnostics and user feedback.

```typescript
interface LogEntry {
  timestamp: Date;  // ISO 8601
  level: LogLevel;  // Severity level
  message: string;  // Log text, max 500 chars
  source?: string;  // Component/service name
  metadata?: object; // Structured log data
  userId?: string;  // Optional user tracking
}

// Enum:
enum LogLevel { Debug = 'debug', Info = 'info', Warn = 'warn', Error = 'error', Action = 'action' }

// Validation Rules:
- message: Sanitized for security (no HTML/JS injection)
- metadata: Max 10kB to prevent bloat
- timestamp: Immutable, set on creation
```

### StyleTheme

Visual theming configuration for pie menus and UI.

```typescript
interface StyleTheme {
  colors: ColorMap;       // Custom color palette
  fonts: FontSettings;    // Typography choices
  transparency: number;   // 0.0-1.0 opacity
  sizeMultiplier: number; // 0.5-2.0 scale
  animation: AnimationSettings; // Animation preferences
}

// Supporting Types:
interface ColorMap {
  primary: string;    // e.g., '#111111'
  accent: string;     // e.g., '#35B1FF'
  text: string;       // Main text color
  background: string; // Menu background
}

interface FontSettings {
  family: string; // Font family name
  size: number;  // Base size in px
  weight: number; // Font weight
}

interface AnimationSettings {
  enabled: boolean;      // Global toggle
  duration: number;      // Default ms (100-1000)
  easing: string;        // CSS easing function
}

// Validation Rules:
- colors: Valid hex/web colors
- transparency: 0.1-1.0 for usability
- sizeMultiplier: Prevents unusable extremes
```

## State Transitions

### Profile Lifecycle
- **Created**: Initial state after manual creation
- **Active**: Currently selected and running
- **Inactive**: Saved but not active
- **Deleted**: Marked for removal, reversible within 30 days

### Pie Menu Transitions
- **Hidden**: Not visible
- **Opening**: Animation sequence starting (enabled case)
- **Shown**: Fully displayed and interactive
- **Closing**: Animation sequence ending (enabled case)
- **Closed**: Completely hidden

### Context Evaluation Flow
1. System detects active window/process
2. Applies pattern matching to all conditions
3. Orders by priority for conflict resolution
4. Activates highest priority matching profile
5. Updates visual indicators if enabled

## Constraints & Business Rules

- **Uniqueness**: Profile/PieMenu/Slice/Action IDs globally unique (UUID v4)
- **Ownership**: Delete operations cascade through relationships with user confirmation
- **Limits**: Soft limits for performance (1000 profiles, 100 actions per profile)
- **Export**: All relationships preserved in JSON export, circular dependencies avoided
- **Import**: Validation prevents duplicate IDs, merges compatible overlapping entities
- **Backup**: Automatic snapshot every 100 changes, stores last 5 versions

## Performance Considerations

- Use indexed access for frequent lookups (profiles by ID, actions by type)
- Lazy load large lists (actions list, profile history)
- Cache compiled regex patterns in ContextConditions
- Stream JSON parsing for large export files

## Extension Points

- Custom action types via plugin interface
- Third-party theme imports (validate ColorMap schema)
- Macro recording playback speed adjustments
- Profile sharing with encryption/signing
