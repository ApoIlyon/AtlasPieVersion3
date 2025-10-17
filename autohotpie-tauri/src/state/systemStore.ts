import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import type { ConnectivitySnapshot, StorageMode, SystemStatus, WindowSnapshot } from './types';

type SystemStore = {
  status: SystemStatus;
  initialized: boolean;
  error: string | null;
  init: () => Promise<void>;
  setOffline: (isOffline: boolean, timestamp?: string) => void;
  setWindowSnapshot: (snapshot: WindowSnapshot) => void;
  setStorageMode: (mode: StorageMode) => void;
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
  init: async () => {
    if (get().initialized) {
      return;
    }
    try {
      const status = await invoke<SystemStatus>('system_get_status');
      set({ status, initialized: true, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        initialized: true,
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
    }));
  },
  setWindowSnapshot: (snapshot) => {
    set((state) => ({
      status: {
        ...state.status,
        window: snapshot,
      },
    }));
  },
  setStorageMode: (mode) => {
    set((state) => ({
      status: {
        ...state.status,
        storageMode: mode,
        safeMode: mode === 'read_only',
      },
    }));
  },
}));
