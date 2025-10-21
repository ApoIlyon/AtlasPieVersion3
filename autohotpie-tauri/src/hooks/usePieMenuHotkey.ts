import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { PieSliceDefinition } from '../components/pie/PieMenu';
import type { ActionEventPayload, ActionEventStatus } from '../types/actionEvents';
import type { ActiveProfileSnapshot } from '../types/hotkeys';
import { useHotkeyStore } from '../state/hotkeyStore';
import { useSystemStore } from '../state/systemStore';
import { useAppStore } from '../state/appStore';
import { useProfileStore } from '../state/profileStore';

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<any>;

function getTauriInvoke(): TauriInvoke | null {
  if (!isTauriEnvironment()) {
    return null;
  }

  const tauriWindow = window as unknown as {
    __TAURI__?: {
      invoke?: TauriInvoke;
      core?: {
        invoke?: TauriInvoke;
      };
    };
  };

  return tauriWindow.__TAURI__?.core?.invoke ?? tauriWindow.__TAURI__?.invoke ?? null;
}

type ModifierFlags = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

function createHotkeyMatcher(hotkey: string) {
  const parts = hotkey
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  const modifiers: ModifierFlags = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };

  let primaryKey: string | null = null;

  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') {
      modifiers.ctrl = true;
      continue;
    }

    if (part === 'shift') {
      modifiers.shift = true;
      continue;
    }
    if (part === 'alt' || part === 'option') {
      modifiers.alt = true;
      continue;
    }
    if (part === 'meta' || part === 'cmd' || part === 'command' || part === 'win') {
      modifiers.meta = true;
      continue;
    }
    primaryKey = part;
  }

  return (event: KeyboardEvent) => {
    if (event.ctrlKey !== modifiers.ctrl) {
      return false;
    }
    if (event.shiftKey !== modifiers.shift) {
      return false;
    }
    if (event.altKey !== modifiers.alt) {
      return false;
    }
    if (event.metaKey !== modifiers.meta) {
      return false;
    }

    if (!primaryKey) {
      return true;
    }

    const key = event.key?.toLowerCase();
    const code = event.code?.toLowerCase();

    if (primaryKey === 'space') {
      return key === ' ' || key === 'space' || code === 'space';
    }

    if (code && code.startsWith('key')) {
      const normalized = code.replace('key', '');
      if (normalized === primaryKey) {
        return true;
      }
    }

    if (code && code.startsWith('digit')) {
      const normalized = code.replace('digit', '');
      if (normalized === primaryKey) {
        return true;
      }
    }

    if (key === primaryKey) {
      return true;
    }

    return false;
  };
}

interface WindowEventPayload {
  isFullscreen: boolean;
  storageMode: 'readWrite' | 'readOnly' | string;
}

export interface LastActionState {
  status: ActionEventStatus;
  message: string | null;
  actionId: string;
  actionName: string;
  timestamp: string;
  durationMs: number | null;
  invocationId: string | null;
}

export interface UsePieMenuHotkeyOptions {
  hotkeyEvent?: string;
  autoCloseMs?: number;
  fallbackHotkey?: string | string[];
}

export interface PieMenuHotkeyState {
  isOpen: boolean;
  activeSliceId: string | null;
  lastAction: LastActionState | null;
  lastSafeModeReason: string | null;
  activeProfile: ActiveProfileSnapshot | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveSlice: (sliceId: string | null) => void;
  handleSelect: (sliceId: string, slice?: PieSliceDefinition) => void;
  clearLastAction: () => void;
  recordActionOutcome: (payload: {
    id: string;
    name: string;
    status: ActionEventStatus;
    message?: string | null;
    timestamp?: string;
    durationMs?: number | null;
    invocationId?: string | null;
  }) => void;
}

export function usePieMenuHotkey(options: UsePieMenuHotkeyOptions = {}): PieMenuHotkeyState {
  const {
    hotkeyEvent = 'hotkeys://trigger',
    autoCloseMs = 0,
    fallbackHotkey = 'Control+Alt+Space',
  } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastActionState | null>(null);
  const [lastSafeModeReason, setLastSafeModeReason] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ActiveProfileSnapshot | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { dialogOpen: hasConflictDialogOpen, dialogStatus: dialogStatusState } = useHotkeyStore((state) => ({
    dialogOpen: state.dialogOpen,
    dialogStatus: state.dialogStatus,
  }));
  const systemHotkeyStatus = useSystemStore((state) => state.hotkeyStatus);
  const hasHotkeyConflicts = useMemo(() => {
    const dialogConflict = dialogStatusState && !dialogStatusState.registered;
    const systemConflict = systemHotkeyStatus && !systemHotkeyStatus.registered;
    return Boolean(dialogConflict || systemConflict);
  }, [dialogStatusState, systemHotkeyStatus]);
  const profileStoreState = useProfileStore((state) => ({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
  }));

  const clearTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleAutoClose = useCallback(() => {
    clearTimer();
    if (autoCloseMs > 0) {
      closeTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        closeTimerRef.current = null;
      }, autoCloseMs);
    }
  }, [autoCloseMs, clearTimer]);

  useEffect(() => clearTimer, [clearTimer, isOpen]);

  useEffect(() => {
    if (hasConflictDialogOpen || hasHotkeyConflicts) {
      clearTimer();
      setIsOpen(false);
    }
  }, [clearTimer, hasConflictDialogOpen, hasHotkeyConflicts]);

  const recordActionOutcome = useCallback(
    (payload: {
      id: string;
      name: string;
      status: ActionEventStatus;
      message?: string | null;
      timestamp?: string;
      durationMs?: number | null;
      invocationId?: string | null;
    }) => {
      const timestamp = payload.timestamp ?? new Date().toISOString();
      const durationMs = payload.durationMs ?? null;
      const invocationId = payload.invocationId ?? null;

      setLastAction({
        status: payload.status,
        message: payload.message ?? null,
        actionId: payload.id,
        actionName: payload.name,
        timestamp,
        durationMs,
        invocationId,
      });

      const recordAppMetric = useAppStore.getState().recordActionMetric;
      recordAppMetric({
        actionId: payload.id,
        actionName: payload.name,
        status: payload.status,
        message: payload.message ?? null,
        timestamp,
        durationMs,
        invocationId,
      });
      if (payload.status === 'success') {
        setIsOpen(false);
        clearTimer();
        return;
      }
      setIsOpen(false);
      clearTimer();
    },
    [clearTimer],
  );

  const fallbackHotkeys = useMemo(() => {
    const base: string[] = (() => {
      if (!fallbackHotkey) {
        return [];
      }
      return Array.isArray(fallbackHotkey) ? fallbackHotkey : [fallbackHotkey];
    })();

    if (!isTauriEnvironment()) {
      const hotkeys = new Set<string>(base);
      const activeProfileId = profileStoreState.activeProfileId;
      const fallbackRecord = profileStoreState.profiles[0];
      const activeRecord = activeProfileId
        ? profileStoreState.profiles.find((record) => record.profile.id === activeProfileId)
        : fallbackRecord;

      if (fallbackRecord?.profile.globalHotkey) {
        hotkeys.add(fallbackRecord.profile.globalHotkey.trim());
      }
      if (activeRecord?.profile.globalHotkey) {
        hotkeys.add(activeRecord.profile.globalHotkey.trim());
      }
      return Array.from(hotkeys);
    }

    return base;
  }, [fallbackHotkey, profileStoreState.activeProfileId, profileStoreState.profiles]);

  useEffect(() => {
    if (!isTauriEnvironment() && typeof window !== 'undefined') {
      (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__ = fallbackHotkeys.map(
        (key) => key.toLowerCase(),
      );
    }
  }, [fallbackHotkeys]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      const matchers = fallbackHotkeys.map((hotkey) => createHotkeyMatcher(hotkey));

      const clearMenuState = () => {
        clearTimer();
        setIsOpen(false);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.repeat) {
          return;
        }
        if (hasConflictDialogOpen || hasHotkeyConflicts) {
          if (matchers.some((match) => match(event)) || event.key === 'Escape') {
            event.preventDefault();
            clearMenuState();
          }
          return;
        }

        if (matchers.some((match) => match(event))) {
          event.preventDefault();
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              scheduleAutoClose();
            } else {
              clearTimer();
            }
            return next;
          });
          return;
        }
        if (event.key === 'Escape') {
          clearMenuState();
        }
      };

      const toggleEvent = () => {
        if (hasConflictDialogOpen || hasHotkeyConflicts) {
          clearMenuState();
          return;
        }
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            scheduleAutoClose();
          } else {
            clearTimer();
          }
          return next;
        });
      };

      const openEvent = () => {
        if (hasConflictDialogOpen || hasHotkeyConflicts) {
          clearMenuState();
          return;
        }
        setIsOpen(true);
        scheduleAutoClose();
      };

      const closeEvent = () => {
        clearMenuState();
      };

      const actionEvent = (event: Event) => {
        const detail = (event as CustomEvent<{
          id?: string;
          name?: string;
          status?: ActionEventStatus;
          message?: string | null;
        }>).detail;
        if (!detail?.id || !detail.name || !detail.status) {
          return;
        }
        recordActionOutcome({
          id: detail.id,
          name: detail.name,
          status: detail.status,
          message: detail.message ?? null,
          durationMs: null,
          invocationId: null,
        });
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('pie-menu:toggle', toggleEvent);
      window.addEventListener('pie-menu:open', openEvent);
      window.addEventListener('pie-menu:close', closeEvent);
      window.addEventListener('pie-menu:action', actionEvent as EventListener);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('pie-menu:toggle', toggleEvent);
        window.removeEventListener('pie-menu:open', openEvent);
        window.removeEventListener('pie-menu:close', closeEvent);
        window.removeEventListener('pie-menu:action', actionEvent as EventListener);
      };
    }
  }, [clearTimer, fallbackHotkeys, hasConflictDialogOpen, hasHotkeyConflicts, recordActionOutcome, scheduleAutoClose]);

  useEffect(() => {
    let isMounted = true;
    let hotkeyUnlisten: (() => void) | undefined;
    let executedUnlisten: (() => void) | undefined;
    let failedUnlisten: (() => void) | undefined;
    let aggregatedUnlisten: (() => void) | undefined;
    let windowUnlisten: (() => void) | undefined;
    let profileUnlisten: (() => void) | undefined;

    const setup = async () => {
      // Wait for Tauri API to be available
      const maxWaitTime = 5000;
      const startTime = Date.now();
      
      while (!isTauriEnvironment() && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!isTauriEnvironment()) {
        return;
      }
      
      const { listen } = await import('@tauri-apps/api/event');

      if (!isMounted) {
        return;
      }

      const handleActionEvent = (payload: ActionEventPayload) => {
        recordActionOutcome({
          id: payload.id,
          name: payload.name,
          status: payload.status,
          message: payload.message ?? null,
          timestamp: payload.timestamp,
          durationMs: payload.durationMs,
          invocationId: payload.invocationId ?? null,
        });
      };

      let aggregatorReady = false;
      const invokeFn = getTauriInvoke();
      if (invokeFn) {
        try {
          await invokeFn('subscribe_action_events');
          const result = (await invokeFn('recent_action_events')) as ActionEventPayload[] | undefined;
          const history = result ?? [];
          const last = history.at(-1);
          if (last) {
            recordActionOutcome({
              id: last.id,
              name: last.name,
              status: last.status,
              message: last.message ?? null,
              timestamp: last.timestamp,
              durationMs: last.durationMs,
              invocationId: last.invocationId ?? null,
            });
          }
          aggregatedUnlisten = await listen<ActionEventPayload>('actions://event', (event) => {
            handleActionEvent(event.payload);
          });
          aggregatorReady = true;
        } catch (error) {
          console.error('Failed to initialize action events channel', error);
        }
      }

      try {
        const initialProfile = (await invoke('resolve_active_profile')) as ActiveProfileSnapshot | null;
        if (isMounted) {
          setActiveProfile(initialProfile ?? null);
        }
      } catch (error) {
        console.error('Failed to resolve active profile', error);
      }

      profileUnlisten = await listen<{ profile: ActiveProfileSnapshot | null }>('profiles://active-changed', (event) => {
        setActiveProfile(event.payload.profile ?? null);
      });

      hotkeyUnlisten = await listen(hotkeyEvent, () => {
        setIsOpen((prev) => {
          if (hasConflictDialogOpen) {
            clearTimer();
            return false;
          }

          const next = !prev;
          if (next) {
            scheduleAutoClose();
          } else {
            clearTimer();
          }
          return next;
        });
      });

      if (!aggregatorReady) {
        executedUnlisten = await listen<ActionEventPayload>('actions://executed', (event) => {
          handleActionEvent(event.payload);
        });

        failedUnlisten = await listen<ActionEventPayload>('actions://failed', (event) => {
          handleActionEvent(event.payload);
        });
      }

      windowUnlisten = await listen<WindowEventPayload>('system://window-info', (event) => {
        const { isFullscreen, storageMode } = event.payload;
        if (isFullscreen) {
          setLastSafeModeReason('Fullscreen application detected. Pie menu is paused to avoid interference.');
        } else if (storageMode === 'readOnly') {
          setLastSafeModeReason(
            'Storage is read-only. Pie menu is paused until write access is restored.',
          );
        } else {
          setLastSafeModeReason(null);
        }
      });
    };

    void setup();

    return () => {
      isMounted = false;
      clearTimer();
      hotkeyUnlisten?.();
      executedUnlisten?.();
      aggregatedUnlisten?.();
      windowUnlisten?.();
      profileUnlisten?.();
    };
  }, [clearTimer, hasConflictDialogOpen, hasHotkeyConflicts, hotkeyEvent, recordActionOutcome, scheduleAutoClose]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }
    const index = profileStoreState.activeProfileId
      ? profileStoreState.profiles.findIndex((entry) => entry.profile.id === profileStoreState.activeProfileId)
      : profileStoreState.profiles.length ? 0 : -1;
    if (index >= 0) {
      const record = profileStoreState.profiles[index];
      setActiveProfile({
        index,
        name: record.profile.name,
        matchKind: 'fallback',
      });
    }
  }, [profileStoreState.activeProfileId, profileStoreState.profiles]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (hasConflictDialogOpen || hasHotkeyConflicts) {
        clearTimer();
        return false;
      }

      const next = !prev;
      if (next) {
        scheduleAutoClose();
      } else {
        clearTimer();
      }
      return next;
    });
  }, [clearTimer, hasConflictDialogOpen, hasHotkeyConflicts, scheduleAutoClose]);

  const open = useCallback(() => {
    if (hasConflictDialogOpen || hasHotkeyConflicts) {
      clearTimer();
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    scheduleAutoClose();
  }, [clearTimer, hasConflictDialogOpen, hasHotkeyConflicts, scheduleAutoClose]);

  const close = useCallback(() => {
    setIsOpen(false);
    clearTimer();
  }, [clearTimer]);

  const handleSelect = useCallback(
    (sliceId: string, slice?: PieSliceDefinition) => {
      setActiveSliceId(sliceId);
      if (!isTauriEnvironment() && slice?.label) {
        recordActionOutcome({
          id: sliceId,
          name: slice.label,
          status: 'success',
        });
      }
      if (autoCloseMs === 0) {
        setIsOpen(false);
      } else {
        scheduleAutoClose();
      }
    },
    [autoCloseMs, recordActionOutcome, scheduleAutoClose],
  );

  const setActiveSlice = useCallback((sliceId: string | null) => {
    setActiveSliceId(sliceId);
  }, []);

  const clearLastAction = useCallback(() => {
    setLastAction(null);
  }, []);

  return useMemo(
    () => ({
      isOpen,
      activeSliceId,
      lastAction,
      lastSafeModeReason,
      activeProfile,
      toggle,
      open,
      close,
      setActiveSlice: setActiveSliceId,
      handleSelect,
      clearLastAction,
      recordActionOutcome,
    }),
    [
      activeSliceId,
      clearLastAction,
      close,
      handleSelect,
      isOpen,
      lastAction,
      lastSafeModeReason,
      open,
      recordActionOutcome,
      setActiveSlice,
      toggle,
    ],
  );
}
