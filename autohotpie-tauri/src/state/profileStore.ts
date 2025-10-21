import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { HotkeyRegistrationStatus } from '../types/hotkeys';

export type ActivationMatchMode =
  | 'always'
  | 'process_name'
  | 'window_title'
  | 'window_class'
  | 'custom';

export interface ActivationRule {
  mode: ActivationMatchMode;
  value?: string | null;
  negate?: boolean | null;
}

export interface Profile {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  globalHotkey?: string | null;
  activationRules: ActivationRule[];
  rootMenu: string;
}

export interface PieSlice {
  id: string;
  label: string;
  icon?: string | null;
  hotkey?: string | null;
  action?: string | null;
  childMenu?: string | null;
  order: number;
}

export interface PieAppearance {
  radius: number;
  innerRadius: number;
  fontSize: number;
}

export interface PieMenu {
  id: string;
  title: string;
  appearance: PieAppearance;
  slices: PieSlice[];
}

export interface ProfileRecord {
  profile: Profile;
  menus: PieMenu[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProfileStorePayload {
  schemaVersion: number;
  profiles: ProfileRecord[];
  activeProfileId?: string | null;
  migratedFromSettings?: string | null;
}

interface ProfileStoreState {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  lastHotkeyStatus: HotkeyRegistrationStatus | null;
  lastHotkeyAttempt: HotkeyAttemptSnapshot | null;
  registeringHotkeyFor: string | null;
  suppressHotkeyConflicts: boolean;
  loadProfiles: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  saveProfile: (record: ProfileRecord) => Promise<ProfileRecord | null>;
  deleteProfile: (profileId: string) => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
  setProfiles: (payload: ProfileStorePayload) => void;
  getProfileById: (profileId: string) => ProfileRecord | undefined;
  getProfileByIndex: (index: number) => ProfileRecord | undefined;
  clearHotkeyStatus: () => void;
  retryProfileHotkeyWithOverride: () => Promise<HotkeyRegistrationStatus | null>;
}

const eventBindings: {
  storeChanged?: UnlistenFn;
  activeChanged?: UnlistenFn;
} = {};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

interface HotkeyAttemptSnapshot {
  profileId: string | null;
  accelerator: string | null;
  conflictCodes?: string[] | null;
}

async function registerActiveHotkey(
  profile: Profile | undefined,
  previousProfileId: string | null,
  set: (partial: Partial<ProfileStoreState>) => void,
  get: () => ProfileStoreState,
): Promise<HotkeyRegistrationStatus | null> {
  if (!isTauriEnvironment()) {
    return null;
  }

  const lastStatus = get().lastHotkeyStatus;
  const lastAttempt = get().lastHotkeyAttempt;
  const inFlightFor = get().registeringHotkeyFor;
  const suppressConflicts = get().suppressHotkeyConflicts;

  if (inFlightFor && profile && inFlightFor === profile.id) {
    return lastStatus;
  }

  try {
    if (previousProfileId && (!profile || profile.id !== previousProfileId)) {
      await invoke('unregister_hotkey', {
        request: { id: `profile:${previousProfileId}` },
      });
    }
  } catch (error) {
    console.warn('Failed to unregister previous profile hotkey', error);
  }

  if (!profile || !profile.enabled) {
    set({ lastHotkeyAttempt: null, registeringHotkeyFor: null });
    return null;
  }

  const accelerator = profile.globalHotkey?.trim();
  if (!accelerator) {
    set({ lastHotkeyAttempt: null, registeringHotkeyFor: null });
    return null;
  }

  if (suppressConflicts) {
    if (
      lastAttempt &&
      lastAttempt.profileId === profile.id &&
      lastAttempt.accelerator === accelerator &&
      (lastAttempt.conflictCodes?.length ?? 0) > 0
    ) {
      return null;
    }
    set({ suppressHotkeyConflicts: false });
  }

  if (
    lastStatus &&
    !lastStatus.registered &&
    lastAttempt &&
    lastAttempt.profileId === profile.id &&
    lastAttempt.accelerator === accelerator
  ) {
    const previousCodes = lastAttempt.conflictCodes ?? null;
    const currentCodes = lastStatus.conflicts?.map((conflict) => conflict.code) ?? null;
    if (
      (!previousCodes && !currentCodes) ||
      (previousCodes && currentCodes && previousCodes.length === currentCodes.length && previousCodes.every((code, index) => code === currentCodes[index]))
    ) {
      if (suppressConflicts) {
        return null;
      }
      return lastStatus;
    }
  }

  set({ registeringHotkeyFor: profile.id, suppressHotkeyConflicts: false });
  try {
    const status = await invoke<HotkeyRegistrationStatus>('register_hotkey', {
      request: {
        id: `profile:${profile.id}`,
        accelerator,
        event: 'hotkeys://trigger',
        allowConflicts: false,
      },
    });
    if (!status.registered) {
      console.warn('Profile hotkey registered with conflicts', status.conflicts);
    }
    set({
      lastHotkeyAttempt: {
        profileId: profile.id,
        accelerator,
        conflictCodes: status.conflicts?.map((conflict) => conflict.code) ?? null,
      },
    });
    return status;
  } catch (error) {
    console.error('Failed to register profile hotkey', error);
    const failureStatus: HotkeyRegistrationStatus = {
      registered: false,
      conflicts: [
        {
          code: 'exception',
          message: toErrorMessage(error),
        },
      ],
    };
    set({
      lastHotkeyAttempt: {
        profileId: profile.id,
        accelerator,
        conflictCodes: failureStatus.conflicts.map((conflict) => conflict.code),
      },
    });
    return failureStatus;
  } finally {
    const current = get().registeringHotkeyFor;
    if (current === profile.id) {
      set({ registeringHotkeyFor: null });
    }
  }
}

async function attachListeners(set: (partial: Partial<ProfileStoreState>) => void, get: () => ProfileStoreState) {
  if (!isTauriEnvironment()) {
    return;
  }

  if (!eventBindings.storeChanged) {
    eventBindings.storeChanged = await listen<ProfileStorePayload>('profiles://store-changed', ({ payload }) => {
      if (payload) {
        set({
          profiles: payload.profiles ?? [],
          activeProfileId: payload.activeProfileId ?? null,
          initialized: true,
          isLoading: false,
          error: null,
        });
        const record = get().getProfileById(payload.activeProfileId ?? '');
        void registerActiveHotkey(record?.profile, payload.activeProfileId ?? null, set, get).then(
          (status) => {
            if (status) {
              set({ lastHotkeyStatus: status });
            }
          },
        );
      }
    });
  }

  if (!eventBindings.activeChanged) {
    eventBindings.activeChanged = await listen<{ profile: { index: number } | null }>(
      'profiles://active-changed',
      ({ payload }) => {
        if (!payload?.profile) {
          set({ activeProfileId: null });
          return;
        }
        const record = get().getProfileByIndex(payload.profile.index);
        if (record) {
          set({ activeProfileId: record.profile.id });
          void registerActiveHotkey(record.profile, record.profile.id, set, get).then((status) => {
            if (status) {
              set({ lastHotkeyStatus: status });
            }
          });
        }
      },
    );
  }
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  isLoading: false,
  error: null,
  initialized: false,
  lastHotkeyStatus: null,
  lastHotkeyAttempt: null,
  registeringHotkeyFor: null,
  suppressHotkeyConflicts: false,
  async loadProfiles() {
    if (get().isLoading) {
      return;
    }

    if (!isTauriEnvironment()) {
      set({ initialized: true, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      await attachListeners((partial) => set(partial as ProfileStoreState), get);
      const payload = await invoke<ProfileStorePayload>('list_profiles');
      get().setProfiles(payload);
      const activeRecord = get().getProfileById(payload.activeProfileId ?? '');
      const status = await registerActiveHotkey(activeRecord?.profile, payload.activeProfileId ?? null, set, get);
      if (status) {
        set({ lastHotkeyStatus: status });
      }
    } catch (error) {
      set({ error: toErrorMessage(error) });
    } finally {
      set({ isLoading: false, initialized: true });
    }
  },
  async refreshProfiles() {
    if (!isTauriEnvironment()) {
      return;
    }
    try {
      const payload = await invoke<ProfileStorePayload>('list_profiles');
      get().setProfiles(payload);
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },
  async saveProfile(record) {
    if (!isTauriEnvironment()) {
      set({ error: 'Profiles cannot be modified in browser preview mode.' });
      return null;
    }
    try {
      const saved = await invoke<ProfileRecord>('save_profile', { record });
      set({ suppressHotkeyConflicts: false });
      await get().refreshProfiles();
      return saved;
    } catch (error) {
      set({ error: toErrorMessage(error) });
      return null;
    }
  },
  async deleteProfile(profileId) {
    if (!isTauriEnvironment()) {
      set({ error: 'Profiles cannot be modified in browser preview mode.' });
      return;
    }
    try {
      await invoke('delete_profile', { profileId });
      await get().refreshProfiles();
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },
  async activateProfile(profileId) {
    if (!isTauriEnvironment()) {
      return;
    }
    try {
      await invoke('activate_profile', { profileId });
      const record = get().getProfileById(profileId);
      const status = await registerActiveHotkey(record?.profile, profileId, set, get);
      if (status) {
        set({ lastHotkeyStatus: status });
      }
      set({ activeProfileId: profileId });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },
  setProfiles(payload) {
    set({
      profiles: payload.profiles ?? [],
      activeProfileId: payload.activeProfileId ?? null,
      initialized: true,
      isLoading: false,
      error: null,
    });
  },
  getProfileById(profileId) {
    if (!profileId) {
      return undefined;
    }
    return get().profiles.find((item) => item.profile.id === profileId);
  },
  getProfileByIndex(index) {
    if (index < 0) {
      return undefined;
    }
    return get().profiles[index];
  },
  clearHotkeyStatus() {
    set((state) => ({
      lastHotkeyStatus: null,
      suppressHotkeyConflicts: true,
      lastHotkeyAttempt: state.lastHotkeyAttempt,
    }));
  },
  async retryProfileHotkeyWithOverride() {
    const attempt = get().lastHotkeyAttempt;
    if (!attempt?.profileId || !attempt.accelerator) {
      return null;
    }

    set({ registeringHotkeyFor: attempt.profileId, suppressHotkeyConflicts: false });
    try {
      const status = await invoke<HotkeyRegistrationStatus>('register_hotkey', {
        request: {
          id: `profile:${attempt.profileId}`,
          accelerator: attempt.accelerator,
          event: 'hotkeys://trigger',
          allowConflicts: true,
        },
      });

      if (!status.registered) {
        console.warn('Profile hotkey override still conflicted', status.conflicts);
      }

      set({
        lastHotkeyStatus: status,
        lastHotkeyAttempt: {
          profileId: attempt.profileId,
          accelerator: attempt.accelerator,
          conflictCodes: status.conflicts?.map((conflict) => conflict.code) ?? null,
        },
      });

      return status;
    } catch (error) {
      console.error('Failed to override profile hotkey', error);
      const failureStatus: HotkeyRegistrationStatus = {
        registered: false,
        conflicts: [
          {
            code: 'exception',
            message: toErrorMessage(error),
          },
        ],
      };
      set({
        lastHotkeyStatus: failureStatus,
        lastHotkeyAttempt: {
          profileId: attempt.profileId,
          accelerator: attempt.accelerator,
          conflictCodes: failureStatus.conflicts.map((conflict) => conflict.code),
        },
      });
      return failureStatus;
    } finally {
      if (get().registeringHotkeyFor === attempt.profileId) {
        set({ registeringHotkeyFor: null });
      }
    }
  },
}));

export const selectProfileHotkeyStatus = (state: ProfileStoreState) =>
  state.suppressHotkeyConflicts ? null : state.lastHotkeyStatus;
