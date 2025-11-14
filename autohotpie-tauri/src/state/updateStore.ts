import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { UpdateStatus } from './types';

interface UpdateState {
  status: UpdateStatus | null;
  isChecking: boolean;
  initialized: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  checkForUpdates: (force?: boolean) => Promise<void>;
  setUpdateChannel: (channel: 'stable' | 'beta') => Promise<void>;
}

let unsubscribe: UnlistenFn | null = null;

const desktopOnlyStatus: UpdateStatus = {
  currentVersion: 'dev',
  latestVersion: null,
  isUpdateAvailable: false,
  downloadUrl: null,
  releaseNotes: null,
  lastChecked: null,
  error: 'updates.desktopOnly',
};

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: null,
  isChecking: false,
  initialized: false,
  error: null,
  async initialize() {
    if (get().initialized) {
      return;
    }

    if (!isTauriEnvironment()) {
      set({ status: desktopOnlyStatus, initialized: true, error: null });
      return;
    }

    set({ error: null });
    try {
      const status = await invoke<UpdateStatus>('get_update_status');
      set({ status, initialized: true });
    } catch (error) {
      set({ error: toMessage(error), initialized: true });
    }

    if (!unsubscribe) {
      unsubscribe = await listen<UpdateStatus>('updates://status', (event) => {
        set({ status: event.payload, error: event.payload.error ?? null });
      });
    }
  },
  async checkForUpdates(force = false) {
    if (!isTauriEnvironment()) {
      set({ status: desktopOnlyStatus, error: 'updates.desktopOnly' });
      return;
    }

    if (get().isChecking) {
      return;
    }

    set({ isChecking: true, error: null });
    try {
      const status = await invoke<UpdateStatus>('check_updates', { force });
      set({ status, isChecking: false });
    } catch (error) {
      set({ error: toMessage(error), isChecking: false });
    }
  },
  async setUpdateChannel(channel: 'stable' | 'beta') {
    if (!isTauriEnvironment()) {
      return;
    }

    try {
      const status = await invoke<UpdateStatus>('set_update_channel', { channel });
      set({ status });
    } catch (error) {
      console.error('Failed to set update channel:', error);
    }
  },
}));

export async function disposeUpdateStoreListener() {
  if (unsubscribe) {
    await unsubscribe();
    unsubscribe = null;
  }
}
