import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { ActiveProfileSnapshot, HotkeyRegistrationStatus } from '../types/hotkeys';
import { selectMockActiveProfile } from '../mocks/contextProfiles';

export interface WindowInfo {
  application: string;
  windowTitle: string;
  url?: string;
  filePath?: string;
  processName: string;
  windowClass?: string;
  isActive: boolean;
}

export type SystemStorageMode = 'read_write' | 'read_only';

export interface SystemStatus {
  window: { isFullscreen: boolean };
  storageMode: SystemStorageMode;
  safeMode: boolean;
  connectivity: { isOffline: boolean; lastCheckedAt?: string | null };
}

export interface SystemStoreState {
  currentWindow: WindowInfo | null;
  isTracking: boolean;
  error: string | null;
  trackingInterval: number;
  initialized: boolean;
  status: SystemStatus;
  readOnlyInstructionUrl: string | null;
  hotkeyStatus: HotkeyRegistrationStatus | null;
  activeProfile: ActiveProfileSnapshot | null;
  init: () => Promise<void>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  getCurrentWindow: () => Promise<WindowInfo | null>;
  setTrackingInterval: (interval: number) => void;
  setOffline: (isOffline: boolean, timestamp?: string) => void;
  setStorageMode: (mode: SystemStorageMode) => void;
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
  currentWindow: null,
  isTracking: false,
  error: null,
  trackingInterval: 1000, // 1 second default
  initialized: false,
  status: {
    window: { isFullscreen: false },
    storageMode: 'read_write',
    safeMode: false,
    connectivity: { isOffline: false, lastCheckedAt: null },
  },
  readOnlyInstructionUrl: 'https://github.com/Apollyon/AtlasPieVersion3/blob/main/specs/001-build-tauri-pie/quickstart.md#troubleshooting',
  hotkeyStatus: null,
  activeProfile: null,

  async init() {
    await get().startTracking();
  },
  
  async startTracking() {
    if (get().isTracking) return;
    
    if (!isTauriEnvironment()) {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const mockProcess = params?.get('mockProcess') ?? 'browser.exe';
      const mockWindow = params?.get('mockWindow') ?? 'AutoHotPie - Pie Menu Overhaul';
      const mockPlatform = params?.get('mockPlatform');
      const mockFullscreen = params?.get('mockFullscreen');
      const mockStorage = params?.get('mockStorageMode');
      const forceSafeMode = params?.get('mockSafeMode');
      const isFullscreen = mockFullscreen ? ['1','true','on','yes'].includes(mockFullscreen.toLowerCase()) : false;
      const storageMode = mockStorage === 'read_only' ? 'read_only' : get().status.storageMode;
      const safeMode = forceSafeMode && ['1','true','on','yes','strict'].includes(forceSafeMode.toLowerCase()) ? true : storageMode === 'read_only';
      const connectivity = {
        isOffline: get().status.connectivity.isOffline,
        lastCheckedAt: new Date().toISOString(),
      };

      const selection = selectMockActiveProfile(mockProcess, mockWindow);
      const activeProfileSnapshot: ActiveProfileSnapshot | null = selection
        ? {
            index: selection.index,
            name: selection.name,
            matchKind: selection.matchKind,
            holdToOpen: selection.holdToOpen,
          }
        : null;

      set({
        currentWindow: {
          application: mockPlatform === 'linux' ? 'GNOME Terminal' : 'Browser',
          windowTitle: mockWindow,
          processName: mockProcess,
          isActive: true,
        },
        isTracking: true,
        initialized: true,
        status: {
          window: { isFullscreen },
          storageMode,
          safeMode,
          connectivity,
        },
        activeProfile: activeProfileSnapshot,
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
      set({ currentWindow: windowInfo, status: { ...get().status, window: { isFullscreen: false } } });
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

  setOffline(isOffline: boolean, timestamp?: string) {
    const nextStatus: SystemStatus = {
      ...get().status,
      connectivity: { isOffline, lastCheckedAt: timestamp ?? new Date().toISOString() },
    };
    set({ status: nextStatus });
  },

  setStorageMode(mode: SystemStorageMode) {
    const safeMode = mode === 'read_only';
    set({ status: { ...get().status, storageMode: mode, safeMode } });
  },
}));

// Auto-start tracking when store is created
if (typeof window !== 'undefined') {
  (window as typeof window & { __AUTOHOTPIE_SYSTEM_STORE__?: typeof useSystemStore }).__AUTOHOTPIE_SYSTEM_STORE__ =
    useSystemStore;
  useSystemStore.getState().startTracking().catch(console.error);
}
