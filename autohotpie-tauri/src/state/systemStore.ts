import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { SystemStatus, StorageMode } from './types';

export interface WindowInfo {
  application: string;
  windowTitle: string;
  url?: string;
  filePath?: string;
  processName: string;
  windowClass?: string;
  isActive: boolean;
}

export interface SystemStoreState {
  // Window tracking
  currentWindow: WindowInfo | null;
  isTracking: boolean;
  trackingInterval: number;
  getCurrentWindow: () => Promise<WindowInfo | null>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  setTrackingInterval: (interval: number) => void;

  // App/system status
  status: SystemStatus;
  initialized: boolean;
  error: string | null;
  activeProfile: string | null;
  readOnlyInstructionUrl: string | null;
  init: () => Promise<void>;
  setOffline: (offline: boolean, timestamp?: string | null) => void;
  setStorageMode: (mode: StorageMode) => void;
}

const eventBindings: {
  windowChanged?: UnlistenFn;
} = {};

async function attachListeners(set: (partial: Partial<SystemStoreState>) => void) {
  if (!isTauriEnvironment()) {
    return;
  }

  if (!eventBindings.windowChanged) {
    eventBindings.windowChanged = await listen<{ window: WindowInfo | null }>(
      'system://window-changed',
      ({ payload }) => {
        set({ currentWindow: payload.window });
      }
    );
  }
}

export const useSystemStore = create<SystemStoreState>()((set, get) => ({
  // Window tracking
  currentWindow: null,
  isTracking: false,
  trackingInterval: 1000, // 1 second default
  
  async startTracking() {
    if (get().isTracking) return;
    
    if (!isTauriEnvironment()) {
      // Mock data for browser preview
      set({
        currentWindow: {
          application: 'Browser',
          windowTitle: 'AutoHotPie - Pie Menu Overhaul',
          processName: 'browser.exe',
          isActive: true,
        },
        isTracking: true,
        initialized: true,
      });
      return;
    }

    try {
      await attachListeners(set);
      await invoke('start_window_tracking', { 
        interval: get().trackingInterval 
      });
      set({ isTracking: true, error: null, initialized: true });
      
      // Get initial window info
      const windowInfo = await get().getCurrentWindow();
      set({ currentWindow: windowInfo });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start tracking';
      set({ error: message, isTracking: false });
    }
  },

  async stopTracking() {
    if (!get().isTracking) return;
    
    if (!isTauriEnvironment()) {
      set({ isTracking: false });
      return;
    }

    try {
      await invoke('stop_window_tracking');
      set({ isTracking: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop tracking';
      set({ error: message });
    }
  },

  async getCurrentWindow() {
    if (!isTauriEnvironment()) {
      return {
        application: 'Browser',
        windowTitle: 'AutoHotPie - Pie Menu Overhaul',
        processName: 'browser.exe',
        isActive: true,
      };
    }

    try {
      const windowInfo = await invoke<WindowInfo | null>('get_current_window');
      return windowInfo;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get window info';
      set({ error: message });
      return null;
    }
  },

  setTrackingInterval(interval: number) {
    const wasTracking = get().isTracking;
    set({ trackingInterval: interval });
    
    // Restart tracking with new interval if it was active
    if (wasTracking) {
      get().stopTracking().then(() => {
        get().startTracking();
      });
    }
  },

  // App/system status
  status: {
    connectivity: { isOffline: false, lastChecked: null },
    window: { isFullscreen: false, timestamp: new Date().toISOString() },
    safeMode: false,
    storageMode: 'read_write',
  },
  initialized: false,
  error: null,
  activeProfile: null,
  readOnlyInstructionUrl: 'https://github.com/Apollyon/AtlasPieVersion3/blob/main/specs/001-build-tauri-pie/quickstart.md#troubleshooting',

  async init() {
    if (get().initialized) {
      return;
    }
    if (!isTauriEnvironment()) {
      set({ initialized: true });
      return;
    }
    try {
      const status = await invoke<SystemStatus>('system_get_status');
      set({ status, initialized: true, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load system status';
      set({ error: message, initialized: true });
    }
  },

  setOffline(offline: boolean, timestamp?: string | null) {
    const prev = get().status;
    set({
      status: {
        ...prev,
        connectivity: { isOffline: offline, lastChecked: timestamp ?? new Date().toISOString() },
      },
    });
  },

  setStorageMode(mode: StorageMode) {
    const prev = get().status;
    set({ status: { ...prev, storageMode: mode } });
  },
}));

// Auto-start tracking when store is created (window and status)
if (typeof window !== 'undefined') {
  useSystemStore.getState().startTracking().catch(console.error);
  useSystemStore.getState().init().catch(console.error);
}
