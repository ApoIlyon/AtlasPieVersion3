import type { ActionEventStatus } from '@/types/actionEvents';

export interface Settings {
  global: Record<string, unknown>;
  app_profiles: AppProfile[];
}

export interface AppProfile {
  name: string;
  ahk_handles: string[];
  enable: boolean;
  hover_activation: boolean;
  pie_enable_key: PieEnableKey;
  pie_keys: PieKey[];
}

export interface PieEnableKey {
  use_enable_key: boolean;
  enable_key: string;
  toggle: boolean;
  send_original_func: boolean;
}

export interface PieKey {
  name: string;
  hotkey: string;
  enable: boolean;
  label_delay: number;
  global_menu: boolean;
  activation_mode: ActivationMode;
  pie_menus: PieMenu[];
}

export interface ActivationMode {
  submenu_mode: number;
  pie_key_action: string;
  clickable_functions: boolean;
  escape_radius: EscapeRadius;
  open_menu_in_center: boolean;
  decouple_mouse: boolean;
  key_release_delay: boolean;
}

export interface EscapeRadius {
  enable: boolean;
  radius: number;
}

export interface PieMenu {
  background_color: number[];
  selection_color: number[];
  font_color: number[];
  radius: number;
  thickness: number;
  label_radius: number;
  label_roundness: number;
  pie_angle: number;
  functions: PieFunction[];
}

export interface PieFunction {
  function: string;
  params: Record<string, unknown>;
  label: string;
  hotkey: string;
  clickable: boolean;
  return_mouse_pos: boolean;
  icon: Icon;
}

export interface Icon {
  file_path: string;
  wb_only: boolean;
}

export interface ConnectivitySnapshot {
  isOffline: boolean;
  lastChecked: string | null;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface WindowSnapshot {
  processName?: string | null;
  windowTitle?: string | null;
  cursorPosition?: CursorPosition | null;
  isFullscreen: boolean;
  timestamp: string;
}

export type StorageMode = 'read_write' | 'read_only';

export interface SystemStatus {
  connectivity: ConnectivitySnapshot;
  window: WindowSnapshot;
  safeMode: boolean;
  storageMode: StorageMode;
}

export interface ActionOutcomeSummary {
  actionId: string;
  actionName: string;
  status: ActionEventStatus;
  message: string | null;
  timestamp: string;
  durationMs: number | null;
  invocationId: string | null;
}

export interface ActionOutcomeCounts {
  total: number;
  success: number;
  failure: number;
  skipped: number;
}

export interface ActionOutcomeMetricInput {
  actionId: string;
  actionName: string;
  status: ActionEventStatus;
  message?: string | null;
  timestamp?: string;
  durationMs?: number | null;
  invocationId?: string | null;
}
