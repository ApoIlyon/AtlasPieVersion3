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

const HOTKEY_DEBOUNCE_MS = 200;
const HOTKEY_REPRESS_GRACE_MS = 600;
const ACTION_TOAST_DEDUP_MS = 2000;

declare global {
  interface Window {
    __PIE_DEBUG__?: {
      state: {
        isOpen: boolean;
        hasConflictDialogOpen: boolean;
        hasHotkeyConflicts: boolean;
        currentSafeModeReason: string | null;
        activeSliceId: string | null;
        closeTimerPending: boolean;
        lastToggleAt: number;
      };
    };
  }
}

type ModifierFlags = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

type ParsedHotkey = {
  original: string;
  modifiers: ModifierFlags;
  primaryKey: string | null;
  keySet: Set<string>;
};

const NORMALIZED_MODIFIER_KEYS: Record<string, keyof ModifierFlags> = {
  control: 'ctrl',
  ctrl: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
};

function normalizePrimary(part: string): string {
  if (part === ' ') {
    return 'space';
  }
  return part;
}

function parseHotkey(hotkey: string): ParsedHotkey | null {
  const parts = hotkey
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return null;
  }

  const modifiers: ModifierFlags = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };

  let primaryKey: string | null = null;

  for (const part of parts) {
    const modifierKey = NORMALIZED_MODIFIER_KEYS[part];
    if (modifierKey) {
      modifiers[modifierKey] = true;
      continue;
    }

    if (!primaryKey) {
      primaryKey = normalizePrimary(part);
    }
  }

  const keySet = new Set<string>();
  if (modifiers.ctrl) {
    keySet.add('ctrl');
  }
  if (modifiers.shift) {
    keySet.add('shift');
  }
  if (modifiers.alt) {
    keySet.add('alt');
  }
  if (modifiers.meta) {
    keySet.add('meta');
  }
  if (primaryKey) {
    keySet.add(primaryKey);
  }

  return {
    original: hotkey,
    modifiers,
    primaryKey,
    keySet,
  };
}

function matchesPrimaryKey(parsed: ParsedHotkey, event: KeyboardEvent): boolean {
  if (!parsed.primaryKey) {
    return true;
  }

  const key = event.key?.toLowerCase();
  const code = event.code?.toLowerCase();

  if (parsed.primaryKey === 'space') {
    return key === ' ' || key === 'space' || code === 'space';
  }

  if (key === parsed.primaryKey) {
    return true;
  }

  if (code) {
    if (code.startsWith('key')) {
      const normalized = code.replace('key', '');
      return normalized === parsed.primaryKey;
    }
    if (code.startsWith('digit')) {
      const normalized = code.replace('digit', '');
      return normalized === parsed.primaryKey;
    }
    return code === parsed.primaryKey;
  }

  return false;
}

function hotkeyMatchesEvent(parsed: ParsedHotkey, event: KeyboardEvent): boolean {
  if (event.ctrlKey !== parsed.modifiers.ctrl) {
    return false;
  }
  if (event.shiftKey !== parsed.modifiers.shift) {
    return false;
  }
  if (event.altKey !== parsed.modifiers.alt) {
    return false;
  }
  if (event.metaKey !== parsed.modifiers.meta) {
    return false;
  }

  return matchesPrimaryKey(parsed, event);
}

function normalizeEventKey(eventKey: string | undefined): string | null {
  if (!eventKey) {
    return null;
  }
  const lower = eventKey.toLowerCase();
  if (lower === ' ') {
    return 'space';
  }
  if (NORMALIZED_MODIFIER_KEYS[lower]) {
    return NORMALIZED_MODIFIER_KEYS[lower];
  }
  return lower;
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
  activationMode?: 'toggle' | 'hold';
  profileHoldToOpen?: boolean;
}

export interface PieMenuHotkeyState {
  isOpen: boolean;
  activeSliceId: string | null;
  lastAction: LastActionState | null;
  lastSafeModeReason: string | null;
  currentSafeModeReason: string | null;
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
    activationMode: activationModeOverride,
    profileHoldToOpen,
  } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastActionState | null>(null);
  const [lastSafeModeReason, setLastSafeModeReason] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ActiveProfileSnapshot | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHotkeyEventAtRef = useRef<number>(0);
  const lastToggleAtRef = useRef<number>(0);
  const conflictCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeHoldHotkeyRef = useRef<ParsedHotkey | null>(null);
  const lastToastRef = useRef<{ id: string; timestamp: number } | null>(null);
  const { dialogOpen: hasConflictDialogOpen, dialogStatus: dialogStatusState } = useHotkeyStore((state) => ({
    dialogOpen: state.dialogOpen,
    dialogStatus: state.dialogStatus,
  }));
  const systemHotkeyStatus = useSystemStore((state) => state.hotkeyStatus);
  const systemWindowSnapshot = useSystemStore((state) => state.status.window);
  const hasHotkeyConflicts = useMemo(() => {
    const dialogConflict = dialogStatusState && !dialogStatusState.registered;
    const systemConflict = systemHotkeyStatus && !systemHotkeyStatus.registered;
    return Boolean(dialogConflict || systemConflict);
  }, [dialogStatusState, systemHotkeyStatus]);
  const profileStoreState = useProfileStore((state) => ({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
  }));

  // Compute safe mode reason from systemStore (for E2E tests compatibility)
  const currentSafeModeReason = useMemo(() => {
    if (systemWindowSnapshot.isFullscreen) {
      return 'Fullscreen application detected. Pie menu is paused to avoid interference.';
    }
    if (lastSafeModeReason) {
      return lastSafeModeReason;
    }
    return null;
  }, [systemWindowSnapshot.isFullscreen, lastSafeModeReason]);

  const hasConflictDialogOpenRef = useRef(hasConflictDialogOpen);
  useEffect(() => {
    hasConflictDialogOpenRef.current = hasConflictDialogOpen;
  }, [hasConflictDialogOpen]);

  const hasHotkeyConflictsRef = useRef(hasHotkeyConflicts);
  useEffect(() => {
    hasHotkeyConflictsRef.current = hasHotkeyConflicts;
  }, [hasHotkeyConflicts]);

  const currentSafeModeReasonRef = useRef(currentSafeModeReason);
  useEffect(() => {
    currentSafeModeReasonRef.current = currentSafeModeReason;
  }, [currentSafeModeReason]);

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
      if (conflictCloseTimerRef.current) {
        clearTimeout(conflictCloseTimerRef.current);
      }
      conflictCloseTimerRef.current = setTimeout(() => {
        clearTimer();
        setIsOpen(false);
        lastToggleAtRef.current = Date.now();
        conflictCloseTimerRef.current = null;
      }, 250);
      return;
    }

    if (conflictCloseTimerRef.current) {
      clearTimeout(conflictCloseTimerRef.current);
      conflictCloseTimerRef.current = null;
    }
  }, [clearTimer, hasConflictDialogOpen, hasHotkeyConflicts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.__PIE_DEBUG__ = {
      state: {
        isOpen,
        hasConflictDialogOpen,
        hasHotkeyConflicts,
        currentSafeModeReason,
        activeSliceId,
        closeTimerPending: closeTimerRef.current != null,
        lastToggleAt: lastToggleAtRef.current,
      },
    };
  }, [
    activeSliceId,
    hasConflictDialogOpen,
    hasHotkeyConflicts,
    isOpen,
    currentSafeModeReason,
  ]);

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

      const now = Date.now();
      const duplicateToast =
        lastToastRef.current &&
        lastToastRef.current.id === payload.id &&
        now - lastToastRef.current.timestamp < ACTION_TOAST_DEDUP_MS;

      if (!duplicateToast) {
        setLastAction({
          status: payload.status,
          message: payload.message ?? null,
          actionId: payload.id,
          actionName: payload.name,
          timestamp,
          durationMs,
          invocationId,
        });
        lastToastRef.current = { id: payload.id, timestamp: now };
      }

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
  
  // Auto-close menu if safe mode is enabled
  useEffect(() => {
    if (currentSafeModeReason && isOpen) {
      setIsOpen(false);
      clearTimer();
      // Show notification about forced closure
      recordActionOutcome({
        id: 'safe-mode-forced-close',
        name: 'Pie Menu Closed',
        status: 'skipped',
        message: currentSafeModeReason,
      });
    }
  }, [clearTimer, currentSafeModeReason, isOpen, recordActionOutcome]);

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
  const parsedFallbackHotkeys = useMemo(
    () =>
      fallbackHotkeys
        .map((hotkey) => parseHotkey(hotkey))
        .filter((parsed): parsed is ParsedHotkey => Boolean(parsed)),
    [fallbackHotkeys],
  );
  const resolvedActivationMode = useMemo<'toggle' | 'hold'>(() => {
    if (activationModeOverride) {
      return activationModeOverride;
    }
    if (profileHoldToOpen != null) {
      return profileHoldToOpen ? 'hold' : 'toggle';
    }
    if (activeProfile?.holdToOpen) {
      return 'hold';
    }
    return 'toggle';
  }, [activationModeOverride, profileHoldToOpen, activeProfile?.holdToOpen]);

  const isHoldMode = resolvedActivationMode === 'hold';

  useEffect(() => {
    if (!isTauriEnvironment() && typeof window !== 'undefined') {
      (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__ = parsedFallbackHotkeys.map(
        (parsed) => parsed.original.toLowerCase(),
      );
    }
  }, [parsedFallbackHotkeys]);

  useEffect(() => {
    if (isTauriEnvironment()) {
      return;
    }

    if (!parsedFallbackHotkeys.length) {
      return;
    }

    const clearHoldState = () => {
      activeHoldHotkeyRef.current = null;
      pressedKeysRef.current.clear();
    };

    const clearMenuState = () => {
      clearTimer();
      setIsOpen(false);
      clearHoldState();
    };

    const matchers = parsedFallbackHotkeys.map((parsed) => (event: KeyboardEvent) => hotkeyMatchesEvent(parsed, event));

    const findMatchingHoldHotkey = () =>
      parsedFallbackHotkeys.find((parsed) => Array.from(parsed.keySet).every((key) => pressedKeysRef.current.has(key))) ??
      null;

    const handleKeyDown = (event: KeyboardEvent) => {
      const normalizedKey = normalizeEventKey(event.key) ?? normalizeEventKey(event.code);
      if (normalizedKey) {
        pressedKeysRef.current.add(normalizedKey);
      }

      if (hasConflictDialogOpen || hasHotkeyConflicts) {
        if (!isHoldMode && (matchers.some((match) => match(event)) || event.key === 'Escape')) {
          event.preventDefault();
          clearMenuState();
        }
        return;
      }

      if (isHoldMode) {
        if (event.repeat) {
          return;
        }
        const matched = findMatchingHoldHotkey();
        if (matched && !activeHoldHotkeyRef.current) {
          event.preventDefault();
          
          // Block if in safe mode
          if (lastSafeModeReason) {
            clearTimer();
            return;
          }
          
          activeHoldHotkeyRef.current = matched;
          lastToggleAtRef.current = Date.now();
          setIsOpen(true);
        }
        return;
      }

      if (event.repeat) {
        return;
      }

      if (matchers.some((match) => match(event))) {
        event.preventDefault();
        
        // Block if in safe mode
        if (lastSafeModeReason) {
          clearTimer();
          // Show notification about blocked action
          recordActionOutcome({
            id: 'safe-mode-blocked',
            name: 'Pie Menu Blocked',
            status: 'skipped',
            message: lastSafeModeReason,
          });
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
        return;
      }

      if (event.key === 'Escape') {
        clearMenuState();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const normalizedKey = normalizeEventKey(event.key) ?? normalizeEventKey(event.code);
      if (normalizedKey) {
        pressedKeysRef.current.delete(normalizedKey);
      }

      if (!isHoldMode) {
        return;
      }

      const activeHoldHotkey = activeHoldHotkeyRef.current;
      if (!activeHoldHotkey) {
        return;
      }

      const stillPressed = Array.from(activeHoldHotkey.keySet).every((key) => pressedKeysRef.current.has(key));
      if (!stillPressed) {
        activeHoldHotkeyRef.current = null;
        lastToggleAtRef.current = Date.now();
        clearTimer();
        setIsOpen(false);
      }
    };

    const handleBlur = () => {
      if (isHoldMode && activeHoldHotkeyRef.current) {
        clearMenuState();
      }
      pressedKeysRef.current.clear();
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
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pie-menu:toggle', toggleEvent);
    window.addEventListener('pie-menu:open', openEvent);
    window.addEventListener('pie-menu:close', closeEvent);
    window.addEventListener('pie-menu:action', actionEvent as EventListener);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pie-menu:toggle', toggleEvent);
      window.removeEventListener('pie-menu:open', openEvent);
      window.removeEventListener('pie-menu:close', closeEvent);
      window.removeEventListener('pie-menu:action', actionEvent as EventListener);
      pressedKeysRef.current.clear();
      activeHoldHotkeyRef.current = null;
    };
  }, [
    clearTimer,
    hasConflictDialogOpen,
    hasHotkeyConflicts,
    isHoldMode,
    currentSafeModeReason,
    parsedFallbackHotkeys,
    recordActionOutcome,
    scheduleAutoClose,
  ]);

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

      profileUnlisten = await listen<{ profile: ActiveProfileSnapshot | null }>(
        'profiles://active-changed',
        (event) => {
          setActiveProfile(event.payload.profile ?? null);
        },
      );

      hotkeyUnlisten = await listen(hotkeyEvent, () => {
        const now = Date.now();
        if (now - (lastHotkeyEventAtRef.current ?? 0) < HOTKEY_DEBOUNCE_MS) {
          lastHotkeyEventAtRef.current = now;
          return;
        }
        lastHotkeyEventAtRef.current = now;

        // Block if in safe mode (checked via state)
        const safeModeReason = currentSafeModeReasonRef.current;
        if (safeModeReason) {
          clearTimer();
          // Show notification about blocked action
          recordActionOutcome({
            id: 'safe-mode-blocked',
            name: 'Pie Menu Blocked',
            status: 'skipped',
            message: safeModeReason,
          });
          return;
        }
        
        setIsOpen((prev) => {
          if (hasConflictDialogOpenRef.current || hasHotkeyConflictsRef.current) {
            clearTimer();
            return false;
          }

          if (!prev) {
            lastToggleAtRef.current = now;
            scheduleAutoClose();
            return true;
          }

          if (now - lastToggleAtRef.current < HOTKEY_REPRESS_GRACE_MS) {
            return prev;
          }

          lastToggleAtRef.current = now;
          if (autoCloseMs > 0) {
            scheduleAutoClose();
          } else {
            clearTimer();
          }
          return false;
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
  }, [autoCloseMs, clearTimer, hotkeyEvent, recordActionOutcome, scheduleAutoClose]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      const index = profileStoreState.activeProfileId
        ? profileStoreState.profiles.findIndex((entry) => entry.profile.id === profileStoreState.activeProfileId)
        : profileStoreState.profiles.length ? 0 : -1;

      if (index >= 0) {
        const record = profileStoreState.profiles[index];
        setActiveProfile({
          index,
          name: record.profile.name,
          matchKind: 'fallback',
          holdToOpen: record.profile.holdToOpen ?? false,
        });
      } else {
        setActiveProfile(null);
      }
    }
  }, [profileStoreState.activeProfileId, profileStoreState.profiles]);

  const toggle = useCallback(() => {
    const now = Date.now();

    // Block if in safe mode (fullscreen or read-only)
    if (currentSafeModeReason) {
      clearTimer();
      // Show notification about blocked action
      recordActionOutcome({
        id: 'safe-mode-blocked',
        name: 'Pie Menu Blocked',
        status: 'skipped',
        message: currentSafeModeReason,
      });
      return;
    }

    setIsOpen((prev) => {
      if (hasConflictDialogOpen || hasHotkeyConflicts) {
        clearTimer();
        return false;
      }

      const next = !prev;
      if (next) {
        lastToggleAtRef.current = now;
        scheduleAutoClose();
      } else {
        lastToggleAtRef.current = now;
        clearTimer();
      }
      return next;
    });
  }, [clearTimer, currentSafeModeReason, hasConflictDialogOpen, hasHotkeyConflicts, recordActionOutcome, scheduleAutoClose]);

  const open = useCallback(() => {
    // Block if in safe mode (fullscreen or read-only)
    if (currentSafeModeReason) {
      clearTimer();
      // Show notification about blocked action
      recordActionOutcome({
        id: 'safe-mode-blocked',
        name: 'Pie Menu Blocked',
        status: 'skipped',
        message: currentSafeModeReason,
      });
      return;
    }
    
    if (hasConflictDialogOpen || hasHotkeyConflicts) {
      clearTimer();
      setIsOpen(false);
      return;
    }
    lastToggleAtRef.current = Date.now();
    setIsOpen(true);
    scheduleAutoClose();
  }, [clearTimer, currentSafeModeReason, hasConflictDialogOpen, hasHotkeyConflicts, recordActionOutcome, scheduleAutoClose]);

  const close = useCallback(() => {
    lastToggleAtRef.current = Date.now();
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
      currentSafeModeReason,
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
      activeProfile,
      activeSliceId,
      clearLastAction,
      close,
      handleSelect,
      isOpen,
      lastAction,
      lastSafeModeReason,
      currentSafeModeReason,
      open,
      recordActionOutcome,
      setActiveSlice,
      toggle,
    ],
  );
}
