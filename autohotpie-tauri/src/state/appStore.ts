import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '@/utils/tauriEnvironment';
import type { AppProfile, Settings } from './types';

type AppStore = {
  settings: Settings | null;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  loadSettings: () => Promise<void>;
  initialize: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  addProfile: (profile: AppProfile) => Promise<void>;
  resetSettings: () => Promise<void>;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export const useAppStore = create<AppStore>((set, get) => ({
  settings: null,
  isLoading: false,
  error: null,
  initialized: false,
  loadSettings: async () => {
    if (get().isLoading) {
      return;
    }
    if (!isTauriEnvironment()) {
      set({ initialized: true, isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const settings = await invoke<Settings>('load_settings');
      set({ settings, isLoading: false, initialized: true });
    } catch (error) {
      set({ error: toErrorMessage(error), isLoading: false });
    }
  },
  initialize: async () => {
    if (get().initialized) {
      return;
    }
    await get().loadSettings();
  },
  saveSettings: async (settings) => {
    if (!isTauriEnvironment()) {
      const message = 'Settings cannot be saved in browser preview mode.';
      set({ error: message });
      throw new Error(message);
    }
    set({ error: null });
    try {
      const updated = await invoke<Settings>('save_settings', { settings });
      set({ settings: updated, initialized: true });
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw new Error(message);
    }
  },
  addProfile: async (profile) => {
    if (!isTauriEnvironment()) {
      const message = 'Profiles cannot be modified in browser preview mode.';
      set({ error: message });
      throw new Error(message);
    }
    set({ error: null });
    try {
      const updated = await invoke<Settings>('add_profile', { profile });
      set({ settings: updated, initialized: true });
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw new Error(message);
    }
  },
  resetSettings: async () => {
    if (!isTauriEnvironment()) {
      const message = 'Settings cannot be reset in browser preview mode.';
      set({ error: message });
      throw new Error(message);
    }
    set({ error: null, isLoading: true });
    try {
      const updated = await invoke<Settings>('reset_settings');
      set({ settings: updated, isLoading: false, initialized: true });
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },
}));
