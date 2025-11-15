import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import mockContextProfilesJson from '../mocks/context-profiles.json' assert { type: 'json' };
import type { HotkeyRegistrationStatus } from '../types/hotkeys';
import type { ActionDefinition } from '../types/actions';
import { cloneActionDefinition } from '../types/actions';

export type ActivationMatchMode =
  | 'always'
  | 'process_name'
  | 'window_title'
  | 'window_class'
  | 'screen_area'
  | 'custom';

export interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActivationRule {
  mode: ActivationMatchMode;
  value?: string | null;
  negate?: boolean | null;
  isRegex?: boolean | null;
  caseSensitive?: boolean | null;
  screenArea?: ScreenArea | null;
}

export interface Profile {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  globalHotkey?: string | null;
  activationRules: ActivationRule[];
  rootMenu: string;
  holdToOpen?: boolean | null;
}

export interface PieSlice {
  id: string;
  label: string;
  icon?: string | null;
  hotkey?: string | null;
  action?: string | null;
  childMenu?: string | null;
  order: number;
  description?: string | null;
  color?: string | null;
  shortcut?: string | null;
}

export interface PieAppearance {
  radius: number;
  innerRadius: number;
  fontSize: number;
  animationsEnabled?: boolean;
  theme?: 'dark' | 'light' | 'auto';
  animationStyle?: 'slide' | 'fade' | 'scale' | 'none';
  accentColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
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
  actions: ActionDefinition[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

type ProfileRecordLike = Omit<ProfileRecord, 'actions'> & {
  actions?: ActionDefinition[] | null;
};

export interface ProfileStorePayload {
  schemaVersion: number;
  profiles: ProfileRecordLike[];
  activeProfileId?: string | null;
  migratedFromSettings?: string | null;
}

export interface ProfileRecoveryState {
  message: string;
  filePath: string;
  backupsDir: string;
}

interface ProfileStoreState {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  isLoading: boolean;
  error: string | null;
  validationErrors: string[];
  initialized: boolean;
  lastHotkeyStatus: HotkeyRegistrationStatus | null;
  lastHotkeyAttempt: HotkeyAttemptSnapshot | null;
  registeringHotkeyFor: string | null;
  suppressHotkeyConflicts: boolean;
  recovery: ProfileRecoveryState | null;
  loadProfiles: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  createProfile: (input?: { name?: string; globalHotkey?: string | null }) => Promise<ProfileRecord | null>;
  saveProfile: (record: ProfileRecord) => Promise<ProfileRecord | null>;
  updateProfileActivationRules: (
    profileId: string,
    rules: ActivationRule[],
  ) => Promise<ProfileRecord | null>;
  updatePieMenuAppearance: (
    profileId: string,
    menuId: string,
    appearance: Partial<PieAppearance>
  ) => Promise<PieMenu | null>;
  deleteProfile: (profileId: string) => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
  setProfiles: (payload: ProfileStorePayload) => void;
  getProfileById: (profileId: string) => ProfileRecord | undefined;
  getProfileByIndex: (index: number) => ProfileRecord | undefined;
  clearValidationErrors: () => void;
  clearHotkeyStatus: () => void;
  retryProfileHotkeyWithOverride: () => Promise<HotkeyRegistrationStatus | null>;
  openRecoveryBackups: () => Promise<void>;
  retryRecoveryLoad: () => Promise<void>;
  acknowledgeRecovery: () => Promise<void>;
  addSliceToMenu: (profileId: string, menuId: string) => Promise<void>;
  removeSliceFromMenu: (profileId: string, menuId: string, sliceId: string) => Promise<void>;
}

const eventBindings: {
  storeChanged?: UnlistenFn;
  activeChanged?: UnlistenFn;
  recoveryRequired?: UnlistenFn;
} = {};

interface MockContextProfilesFile {
  profiles: ProfileRecordLike[];
}

function normalizeProfileRecord(record: ProfileRecordLike): ProfileRecord {
  return {
    profile: {
      ...record.profile,
      holdToOpen: record.profile.holdToOpen ?? false,
    },
    menus: (record.menus ?? []).map((menu) => ({
      ...menu,
      appearance: { ...menu.appearance },
      slices: (menu.slices ?? []).map((slice) => ({ ...slice })),
    })),
    actions: (record.actions ?? []).map((action) => cloneActionDefinition(action)),
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
  };
}

function cloneMockProfiles(records: ProfileRecordLike[]): ProfileRecord[] {
  return records.map((record) => normalizeProfileRecord(record));
}

function loadMockProfiles(): ProfileRecord[] {
  const payload = mockContextProfilesJson as unknown as MockContextProfilesFile | undefined;
  if (!payload?.profiles?.length) {
    return [];
  }
  return cloneMockProfiles(payload.profiles);
}

function markProfilesReady(ready: boolean) {
  if (typeof window !== 'undefined') {
    (window as unknown as { __PIE_PROFILES_READY__?: boolean }).__PIE_PROFILES_READY__ = ready;
  }
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

function parseRecoveryPayload(raw: unknown): ProfileRecoveryState | null {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { kind?: string; message?: string; filePath?: string; backupsDir?: string };
      if (parsed && parsed.kind === 'profile-recovery') {
        return {
          message: parsed.message ?? 'Profile data could not be loaded. Manual recovery required.',
          filePath: parsed.filePath ?? '',
          backupsDir: parsed.backupsDir ?? '',
        };
      }
    } catch (error) {
      console.warn('Failed to parse recovery payload', error);
    }
    return null;
  }
  if (typeof raw === 'object') {
    const candidate = raw as { kind?: string; message?: string; filePath?: string; backupsDir?: string };
    if (candidate?.kind === 'profile-recovery') {
      return {
        message: candidate.message ?? 'Profile data could not be loaded. Manual recovery required.',
        filePath: candidate.filePath ?? '',
        backupsDir: candidate.backupsDir ?? '',
      };
    }
  }
  return null;
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
    const attemptRegistration = async (allowConflicts: boolean) =>
      invoke<HotkeyRegistrationStatus>('register_hotkey', {
        request: {
          id: `profile:${profile.id}`,
          accelerator,
          event: 'hotkeys://trigger',
          allowConflicts,
        },
      });

    let status = await attemptRegistration(false);
    if (!status.registered) {
      const conflicts = status.conflicts ?? [];
      const overridable =
        conflicts.length > 0 &&
        conflicts.every((conflict) =>
          conflict.code === 'alreadyRegistered' || conflict.code === 'duplicateInternal',
        );
      if (overridable) {
        try {
          status = await attemptRegistration(true);
        } catch (overrideError) {
          console.warn('Failed to override conflicting hotkey', overrideError);
        }
      }
    }
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
        const normalized = (payload.profiles ?? []).map((record) => normalizeProfileRecord(record));
        set({
          profiles: normalized,
          activeProfileId: payload.activeProfileId ?? null,
          initialized: true,
          isLoading: false,
          error: null,
          recovery: null,
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

  if (!eventBindings.recoveryRequired) {
    eventBindings.recoveryRequired = await listen<ProfileRecoveryState | string | null | undefined>(
      'profiles://recovery-required',
      ({ payload }) => {
        const recovery = parseRecoveryPayload(payload ?? null);
        if (!recovery) {
          console.warn('profiles://recovery-required emitted without payload');
          return;
        }
        set({
          recovery,
          error: null,
          profiles: [],
          activeProfileId: null,
          isLoading: false,
          initialized: true,
          validationErrors: [],
        });
        markProfilesReady(true);
      },
    );
  }
}

export const useProfileStore = create<ProfileStoreState>()((set, get) => ({
  profiles: [],
  activeProfileId: null,
  isLoading: false,
  error: null,
  validationErrors: [],
  initialized: false,
  lastHotkeyStatus: null,
  lastHotkeyAttempt: null,
  registeringHotkeyFor: null,
  suppressHotkeyConflicts: false,
  recovery: null,
  async loadProfiles() {
    if (get().isLoading) {
      return;
    }

    markProfilesReady(false);
    if (!isTauriEnvironment()) {
      const profiles = loadMockProfiles();
      set({
        profiles,
        activeProfileId: profiles[0]?.profile.id ?? null,
        initialized: true,
        isLoading: false,
        error: null,
        validationErrors: [],
      });
      markProfilesReady(true);
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
      const message = toErrorMessage(error);
      const recovery = parseRecoveryPayload(message);
      if (recovery) {
        set({
          recovery,
          error: null,
          profiles: [],
          activeProfileId: null,
          validationErrors: [],
        });
      } else {
        set({ error: message, validationErrors: [] });
      }
    } finally {
      set({ isLoading: false, initialized: true });
      markProfilesReady(true);
    }
  },
  async updateProfileActivationRules(profileId, rules) {
    if (!isTauriEnvironment()) {
      set({ error: 'Profiles cannot be modified in browser preview mode.' });
      return null;
    }
    const record = get().getProfileById(profileId);
    if (!record) {
      set({ error: `Profile ${profileId} not found.` });
      return null;
    }
    const updated: ProfileRecord = {
      ...record,
      profile: {
        ...record.profile,
        activationRules: rules,
        holdToOpen: record.profile.holdToOpen ?? false,
      },
    };
    const saved = await get().saveProfile(updated);
    if (saved) {
      set((state) => ({
        profiles: state.profiles.map((item) => (item.profile.id === profileId ? saved : item)),
      }));
    }
    return saved;
  },
  async refreshProfiles() {
    markProfilesReady(false);
    if (!isTauriEnvironment()) {
      const profiles = loadMockProfiles();
      set({
        profiles,
        activeProfileId: profiles[0]?.profile.id ?? null,
        initialized: true,
        isLoading: false,
        error: null,
        validationErrors: [],
      });
      markProfilesReady(true);
      return;
    }
    try {
      const payload = await invoke<ProfileStorePayload>('list_profiles');
      get().setProfiles(payload);
    } catch (error) {
      const message = toErrorMessage(error);
      const recovery = parseRecoveryPayload(message);
      if (recovery) {
        set({
          recovery,
          error: null,
          profiles: [],
          activeProfileId: null,
          validationErrors: [],
        });
      } else {
        set({ error: message, validationErrors: [] });
      }
    } finally {
      markProfilesReady(true);
    }
  },
  async createProfile(input) {
    if (!isTauriEnvironment()) {
      set({ error: 'Profiles cannot be modified in browser preview mode.' });
      return null;
    }
    if (get().recovery) {
      set({ error: 'Profiles need manual recovery before they can be modified.' });
      return null;
    }
    try {
      const payload = {
        name: input?.name,
        globalHotkey: input?.globalHotkey ?? null,
        holdToOpen: false,
      };
      const record = await invoke<ProfileRecord>('create_profile', { payload });
      await get().refreshProfiles();
      return record;
    } catch (error) {
      const message = toErrorMessage(error);
      if (message.startsWith('{')) {
        try {
          const parsed = JSON.parse(message) as { kind?: string; errors?: string[] };
          if (parsed.kind === 'profile-validation' && Array.isArray(parsed.errors)) {
            set({ validationErrors: parsed.errors, error: null });
            return null;
          }
        } catch (parseError) {
          console.error('Failed to parse validation payload', parseError);
        }
      }
      set({ error: message, validationErrors: [] });
      return null;
    }
  },
  async saveProfile(record) {
    if (!isTauriEnvironment()) {
      set({ error: 'Profiles cannot be modified in browser preview mode.' });
      return null;
    }
    if (get().recovery) {
      set({ error: 'Profiles need manual recovery before they can be modified.' });
      return null;
    }
    try {
      const saved = await invoke<ProfileRecord>('save_profile', { record });
      set({ suppressHotkeyConflicts: false, validationErrors: [] });
      await get().refreshProfiles();
      return saved;
    } catch (error) {
      const message = toErrorMessage(error);
      if (message.startsWith('{')) {
        try {
          const parsed = JSON.parse(message) as { kind?: string; errors?: string[] };
          if (parsed.kind === 'profile-validation' && Array.isArray(parsed.errors)) {
            set({ validationErrors: parsed.errors, error: null });
            return null;
          }
        } catch (parseError) {
          console.error('Failed to parse validation payload', parseError);
        }
      } else {
        set({ error: message, validationErrors: [] });
      }
      return null;
    }
  },
  async deleteProfile(profileId) {
    if (!isTauriEnvironment()) {
      set({ error: 'Profiles cannot be modified in browser preview mode.' });
      return;
    }
    if (get().recovery) {
      set({ error: 'Profiles need manual recovery before they can be modified.' });
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
    const record = get().getProfileById(profileId);
    if (!isTauriEnvironment()) {
      if (!record) {
        set({ error: `Profile ${profileId} not found.` });
        return;
      }
      set({ activeProfileId: profileId, error: null });
      return;
    }
    if (get().recovery) {
      set({ error: 'Profiles need manual recovery before they can be modified.' });
      return;
    }
    try {
      await invoke('activate_profile', { profileId });
      const currentRecord = record ?? get().getProfileById(profileId);
      const status = await registerActiveHotkey(currentRecord?.profile, profileId, set, get);
      if (status) {
        set({ lastHotkeyStatus: status });
      }
      set({ activeProfileId: profileId });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },
  setProfiles(payload) {
    const normalized = (payload.profiles ?? []).map((record) => normalizeProfileRecord(record));
    set({
      profiles: normalized,
      activeProfileId: payload.activeProfileId ?? null,
      initialized: true,
      isLoading: false,
      error: null,
      validationErrors: [],
      recovery: null,
    });
    markProfilesReady(true);
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
  clearValidationErrors() {
    set({ validationErrors: [] });
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
  async openRecoveryBackups() {
    if (!isTauriEnvironment()) {
      return;
    }
    if (!get().recovery) {
      return;
    }
    try {
      await invoke('open_profiles_backups');
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },
  async retryRecoveryLoad() {
    await get().refreshProfiles();
  },
  async acknowledgeRecovery() {
    set({ recovery: null });
  },
  async addSliceToMenu(profileId, menuId) {
    set((state) => {
      const profiles = state.profiles.map((record) => {
        if (record.profile.id !== profileId) return record;
        const menus = record.menus.map((menu) => {
          if (menu.id !== menuId) return menu;
          const existing = menu.slices ?? [];
          const nextOrder = existing.length;
          const newSlice: PieSlice = {
            id: `slice-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            label: `Slice ${nextOrder + 1}`,
            order: nextOrder,
          };
          return {
            ...menu,
            slices: [...existing, newSlice],
          };
        });
        return { ...record, menus };
      });
      return { profiles };
    });
  },

  async removeSliceFromMenu(profileId, menuId, sliceId) {
    set((state) => {
      const profiles = state.profiles.map((record) => {
        if (record.profile.id !== profileId) return record;
        const menus = record.menus.map((menu) => {
          if (menu.id !== menuId) return menu;
          const remaining = (menu.slices ?? []).filter((s) => s.id !== sliceId);
          const normalized = remaining.map((s, index) => ({ ...s, order: index }));
          return { ...menu, slices: normalized };
        });
        return { ...record, menus };
      });
      return { profiles };
    });
  },
  async createPieMenu(
    profileId: string,
    menuData: { title?: string; appearance?: Partial<PieAppearance>; slices?: PieSlice[] }
  ) {
    if (!isTauriEnvironment()) {
      set({ error: 'Pie menus cannot be modified in browser preview mode.' });
      return null;
    }
    const record = get().getProfileById(profileId);
    if (!record) {
      set({ error: `Profile ${profileId} not found.` });
      return null;
    }
    
    const newMenu: PieMenu = {
      id: `menu-${Date.now()}`,
      title: menuData.title || 'New Menu',
      appearance: {
        radius: 200,
        innerRadius: 60,
        fontSize: 14,
        animationsEnabled: true,
        theme: 'dark',
        animationStyle: 'slide',
        accentColor: '#3b82f6',
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        textColor: '#f1f5f9',
        ...menuData.appearance,
      },
      slices: menuData.slices || [],
    };
    
    const updatedRecord = {
      ...record,
      menus: [...record.menus, newMenu],
    };
    
    const saved = await get().saveProfile(updatedRecord);
    return saved ? newMenu : null;
  },
  async deletePieMenu(profileId: string, menuId: string) {
    if (!isTauriEnvironment()) {
      set({ error: 'Pie menus cannot be modified in browser preview mode.' });
      return;
    }
    const record = get().getProfileById(profileId);
    if (!record) {
      set({ error: `Profile ${profileId} not found.` });
      return;
    }
    
    if (record.menus.length <= 1) {
      set({ error: 'Cannot delete the last menu in a profile.' });
      return;
    }
    
    const updatedRecord = {
      ...record,
      menus: record.menus.filter(menu => menu.id !== menuId),
    };
    
    await get().saveProfile(updatedRecord);
  },
  async updatePieMenu(profileId: string, menuId: string, updates: Partial<PieMenu>) {
    if (!isTauriEnvironment()) {
      set({ error: 'Pie menus cannot be modified in browser preview mode.' });
      return null;
    }
    const record = get().getProfileById(profileId);
    if (!record) {
      set({ error: `Profile ${profileId} not found.` });
      return null;
    }
    
    const updatedRecord = {
      ...record,
      menus: record.menus.map(menu => 
        menu.id === menuId ? { ...menu, ...updates } : menu
      ),
    };
    
    const saved = await get().saveProfile(updatedRecord);
    return saved ? saved.menus.find(menu => menu.id === menuId) || null : null;
  },
  async updatePieMenuAppearance(
    profileId: string,
    menuId: string,
    appearance: Partial<PieAppearance>
  ) {
    if (!isTauriEnvironment()) {
      set({ error: 'Pie menus cannot be modified in browser preview mode.' });
      return null;
    }
    const record = get().getProfileById(profileId);
    if (!record) {
      set({ error: `Profile ${profileId} not found.` });
      return null;
    }
    
    const updatedRecord = {
      ...record,
      menus: record.menus.map(menu => 
        menu.id === menuId 
          ? { 
              ...menu, 
              appearance: { ...menu.appearance, ...appearance }
            } 
          : menu
      ),
    };
    
    const saved = await get().saveProfile(updatedRecord);
    return saved ? saved.menus.find(menu => menu.id === menuId) || null : null;
  },
}));

export const selectProfileHotkeyStatus = (state: ProfileStoreState) =>
  state.suppressHotkeyConflicts ? null : state.lastHotkeyStatus;
