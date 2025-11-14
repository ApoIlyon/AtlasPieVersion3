import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '../utils/tauriEnvironment';

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
  currentWindow: WindowInfo | null;
  isTracking: boolean;
  error: string | null;
  trackingInterval: number;
  initialized: boolean;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  getCurrentWindow: () => Promise<WindowInfo | null>;
  setTrackingInterval: (interval: number) => void;
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
}));

// Auto-start tracking when store is created
if (typeof window !== 'undefined') {
  useSystemStore.getState().startTracking().catch(console.error);
}
