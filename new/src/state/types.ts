import type { ActionEventStatus } from '../types/actionEvents';

export interface Settings {
  global: Record<string, unknown>;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  isUpdateAvailable: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  lastChecked: string | null;
  error: string | null;
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
