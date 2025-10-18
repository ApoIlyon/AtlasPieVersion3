import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { isTauriEnvironment } from '@/utils/tauriEnvironment';
import type { ActiveProfileSnapshot } from '@/types/hotkeys';
import type { ConnectivitySnapshot, StorageMode, SystemStatus, WindowSnapshot } from './types';

type SystemStore = {
  status: SystemStatus;
  initialized: boolean;
  error: string | null;
  lastEventAt: string | null;
  activeProfile: ActiveProfileSnapshot | null;
  init: () => Promise<void>;
  setOffline: (isOffline: boolean, timestamp?: string) => void;
  setWindowSnapshot: (snapshot: WindowSnapshot) => void;
  setStorageMode: (mode: StorageMode) => void;
  setActiveProfile: (profile: ActiveProfileSnapshot | null) => void;
};

function defaultConnectivity(): ConnectivitySnapshot {
  return {
    isOffline: false,
    lastChecked: null,
  };
}

function defaultWindow(): WindowSnapshot {
  return {
    processName: null,
    windowTitle: null,
    cursorPosition: null,
    isFullscreen: false,
    timestamp: new Date().toISOString(),
  };
}

const defaultStatus: SystemStatus = {
  connectivity: defaultConnectivity(),
  window: defaultWindow(),
  safeMode: false,
  storageMode: 'read_write',
};

export const useSystemStore = create<SystemStore>((set, get) => ({
  status: defaultStatus,
  initialized: false,
  error: null,
  lastEventAt: null,
  activeProfile: null,
  init: async () => {
    if (get().initialized) {
      return;
    }
    if (!isTauriEnvironment()) {
      set({ initialized: true, error: null, lastEventAt: new Date().toISOString() });
      return;
    }
    try {
      const [status, profile] = await Promise.all([
        invoke<SystemStatus>('system_get_status'),
        invoke<ActiveProfileSnapshot | null>('get_active_profile')
          .catch(() => null),
      ]);
      set({
        status,
        activeProfile: profile,
        initialized: true,
        error: null,
        lastEventAt: new Date().toISOString(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        initialized: true,
        lastEventAt: new Date().toISOString(),
      });
    }

    listen<{ isOffline: boolean; timestamp?: string }>('system://connectivity', (event) => {
      const { isOffline, timestamp } = event.payload;
      get().setOffline(isOffline, timestamp);
    });

    listen<WindowSnapshot>('system://window-info', (event) => {
      get().setWindowSnapshot(event.payload);
    });

    listen<{ mode: StorageMode }>('system://storage-mode', (event) => {
      get().setStorageMode(event.payload.mode);
    });

    listen<{ profile: ActiveProfileSnapshot | null }>('profiles://active-changed', (event) => {
      get().setActiveProfile(event.payload.profile);
    });
  },
  setOffline: (isOffline, timestamp) => {
    set((state) => ({
      status: {
        ...state.status,
        connectivity: {
          isOffline,
          lastChecked: timestamp ?? new Date().toISOString(),
        },
      },
      lastEventAt: new Date().toISOString(),
    }));
  },
  setWindowSnapshot: (snapshot) => {
    set((state) => ({
      status: {
        ...state.status,
        window: snapshot,
      },
      lastEventAt: new Date().toISOString(),
    }));
  },
  setStorageMode: (mode) => {
    set((state) => ({
      status: {
        ...state.status,
        storageMode: mode,
        safeMode: mode === 'read_only',
      },
      lastEventAt: new Date().toISOString(),
    }));
  },
  setActiveProfile: (profile) => {
    set({ activeProfile: profile, lastEventAt: new Date().toISOString() });
  },
}));
