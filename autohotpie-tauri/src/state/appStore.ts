import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '@/utils/tauriEnvironment';
import type {
  ActionOutcomeCounts,
  ActionOutcomeMetricInput,
  ActionOutcomeSummary,
  AppProfile,
  Settings,
} from './types';

const defaultActionOutcomeCounts = (): ActionOutcomeCounts => ({
  total: 0,
  success: 0,
  failure: 0,
  skipped: 0,
});

type AppStore = {
  settings: Settings | null;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  lastActionSummary: ActionOutcomeSummary | null;
  actionOutcomeCounts: ActionOutcomeCounts;
  loadSettings: () => Promise<void>;
  initialize: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  addProfile: (profile: AppProfile) => Promise<void>;
  resetSettings: () => Promise<void>;
  recordActionMetric: (input: ActionOutcomeMetricInput) => void;
  resetActionMetrics: () => void;
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
  lastActionSummary: null,
  actionOutcomeCounts: defaultActionOutcomeCounts(),
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
  recordActionMetric: (input) => {
    set((state) => {
      const summary: ActionOutcomeSummary = {
        actionId: input.actionId,
        actionName: input.actionName,
        status: input.status,
        message: input.message ?? null,
        timestamp: input.timestamp ?? new Date().toISOString(),
        durationMs: input.durationMs ?? null,
        invocationId: input.invocationId ?? null,
      };

      const currentCounts = state.actionOutcomeCounts ?? defaultActionOutcomeCounts();
      const nextCounts: ActionOutcomeCounts = {
        total: currentCounts.total + 1,
        success: currentCounts.success + (input.status === 'success' ? 1 : 0),
        failure: currentCounts.failure + (input.status === 'failure' ? 1 : 0),
        skipped: currentCounts.skipped + (input.status === 'skipped' ? 1 : 0),
      };

      return {
        lastActionSummary: summary,
        actionOutcomeCounts: nextCounts,
      };
    });
  },
  resetActionMetrics: () => {
    set({
      lastActionSummary: null,
      actionOutcomeCounts: defaultActionOutcomeCounts(),
    });
  },
}));
