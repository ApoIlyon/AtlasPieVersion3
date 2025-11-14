// Profile Management API Contracts
// TypeScript interfaces for Tauri's invoke calls and response types

export interface ProfileCreateRequest {
  name: string;
  description?: string;
  template?: 'default' | 'minimal' | 'advanced'; // Predefined starting point
}

export interface ProfileUpdateRequest {
  id: string;
  name?: string;
  description?: string;
  boundApps?: string[];
  settings?: ProfileSettings;
}

export interface ProfileResponse {
  success: boolean;
  data?: Profile;
  error?: string;
}

export interface ProfileListResponse {
  success: boolean;
  data?: {
    profiles: Profile[];
    total: number;
    activeProfileId?: string;
  };
  error?: string;
}

export interface ProfileDeleteRequest {
  id: string;
  force?: boolean; // Bypass confirmation if true
}

export interface ProfileImportRequest {
  jsonData: string; // Validated JSON string
  mergeStrategy?: 'replace' | 'merge' | 'skip'; // Handle conflicts
}

export interface ProfileExportRequest {
  id: string;
  includeRelatedActions?: boolean; // Export dependent actions
}

export interface ProfileExportResponse {
  success: boolean;
  data?: {
    profile: Profile;
    exportedJson: string;
    metadata: {
      version: string;
      exportedAt: string;
      platform: string;
    };
  };
  error?: string;
}

// Tauri command names (invoke calls)
export const PROFILE_COMMANDS = {
  create: 'profile_create',
  read: 'profile_read',
  update: 'profile_update',
  delete: 'profile_delete',
  list: 'profile_list',
  activate: 'profile_activate',
  import: 'profile_import',
  export: 'profile_export',
} as const;

// Error codes for consistent handling
export const PROFILE_ERRORS = {
  NAME_EXISTS: 'PROFILE_NAME_EXISTS',
  NOT_FOUND: 'PROFILE_NOT_FOUND',
  INVALID_JSON: 'INVALID_JSON_SCHEMA',
  CONFLICT_BOUND_APP: 'BOUND_APP_CONFLICT',
  READONLY_ACCESS: 'READONLY_STORAGE_ACCESS',
} as const;

// Supporting types (imported from data-model.ts)
interface Profile {
  id: string;
  name: string;
  description?: string;
  boundApps: string[];
  pieMenus: PieMenu[];
  settings: ProfileSettings;
  createdAt: string;
  updatedAt: string;
}

interface PieMenu {
  id: string;
  name: string;
  slices: Slice[];
  style: MenuStyle;
  animationEnabled: boolean;
  scale: number;
  createdAt: string;
}

interface Slice {
  id: string;
  label: string;
  tooltip?: string;
  icon?: IconReference;
  action: Action;
  hotkey?: HotkeyBinding;
  position: number;
}

interface Action {
  id: string;
  name: string;
  type: string;
  config: unknown;
  examples: string[];
  tags: string[];
  createdAt: string;
}

interface ProfileSettings {
  autoShow: boolean;
  position: 'cursor' | 'screen-center';
  size: 'small' | 'medium' | 'large';
}

interface MenuStyle {
  theme: string;
  customColors?: object;
}

interface IconReference {
  type: 'builtin' | 'custom';
  name: string;
  size?: number;
}

interface HotkeyBinding {
  key: string;
  modifiers: string[];
}
