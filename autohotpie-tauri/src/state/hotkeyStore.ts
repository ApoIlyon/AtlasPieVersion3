import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { HotkeyRegistrationStatus } from '../types/hotkeys';
import { useProfileStore } from './profileStore';

interface RegisterHotkeyInput {
  id: string;
  accelerator: string;
  event?: string;
}

interface HotkeyStoreState {
  dialogOpen: boolean;
  dialogStatus: HotkeyRegistrationStatus | null;
  pendingRequest: RegisterHotkeyInput | null;
  isSubmitting: boolean;
  error: string | null;
  registerHotkey: (input: RegisterHotkeyInput) => Promise<boolean>;
  retryWithOverride: () => Promise<boolean>;
  disableConflictingHotkey: (conflictingId: string) => Promise<boolean>;
  closeDialog: () => void;
  clearError: () => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export const useHotkeyStore = create<HotkeyStoreState>((set, get) => ({
  dialogOpen: false,
  dialogStatus: null,
  pendingRequest: null,
  isSubmitting: false,
  error: null,
  registerHotkey: async (input) => {
    if (!isTauriEnvironment()) {
      const message = 'Hotkeys are unavailable outside the Tauri environment.';
      set({ error: message });
      throw new Error(message);
    }

    set({ isSubmitting: true, error: null });
    try {
      const status = await invoke<HotkeyRegistrationStatus>('register_hotkey', {
        request: { ...input, allowConflicts: false },
      });

      if (input.id.startsWith('profile:')) {
        useProfileStore.setState({ lastHotkeyStatus: status });
      }

      if (!status.registered) {
        set({
          dialogOpen: true,
          dialogStatus: status,
          pendingRequest: input,
        });
        return false;
      }

      set({ dialogOpen: false, dialogStatus: null, pendingRequest: null });
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isSubmitting: false });
    }
  },
  retryWithOverride: async () => {
    const pending = get().pendingRequest;
    if (!pending) {
      return false;
    }
    set({ isSubmitting: true, error: null });
    try {
      const status = await invoke<HotkeyRegistrationStatus>('register_hotkey', {
        request: { ...pending, allowConflicts: true },
      });

      if (pending.id.startsWith('profile:')) {
        useProfileStore.setState({ lastHotkeyStatus: status });
      }

      if (!status.registered) {
        set({ dialogOpen: true, dialogStatus: status, pendingRequest: pending });
        return false;
      }

      set({ dialogOpen: false, dialogStatus: null, pendingRequest: null });
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isSubmitting: false });
    }
  },
  disableConflictingHotkey: async (conflictingId) => {
    const pending = get().pendingRequest;
    if (!pending) {
      return false;
    }
    set({ isSubmitting: true, error: null });
    try {
      await invoke('unregister_hotkey', {
        request: { id: conflictingId },
      });

      const status = await invoke<HotkeyRegistrationStatus>('register_hotkey', {
        request: { ...pending, allowConflicts: false },
      });

      if (pending.id.startsWith('profile:')) {
        useProfileStore.setState({ lastHotkeyStatus: status });
      }

      if (!status.registered) {
        set({ dialogOpen: true, dialogStatus: status, pendingRequest: pending });
        return false;
      }

      set({ dialogOpen: false, dialogStatus: null, pendingRequest: null });
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isSubmitting: false });
    }
  },
  closeDialog: () => set({ dialogOpen: false, dialogStatus: null, pendingRequest: null }),
  clearError: () => set({ error: null }),
}));
