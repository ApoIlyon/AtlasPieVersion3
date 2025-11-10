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
import type { StorageMode, WindowSnapshot } from '../state/types';

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<any>;

interface HotkeyEventPayload {
  id: string;
  accelerator: string;
}

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

const HOTKEY_DEBOUNCE_MS = 50;
const HOTKEY_REPRESS_GRACE_MS = 150; // Increased to prevent accidental rapid toggles
const MENU_OPEN_PROTECTION_MS = 200; // Protection window after opening
const ACTION_TOAST_DEDUP_MS = 2000;
const REOPEN_COOLDOWN_MS = 250; // Prevent immediate reopen after close

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
  initialActiveProfile?: ActiveProfileSnapshot | null;
}

export interface PieMenuHotkeyState {
  isOpen: boolean;
  activeSliceId: string | null;
  lastAction: LastActionState | null;
  lastSafeModeReason: string | null;
  currentSafeModeReason: string | null;
  activeProfile: ActiveProfileSnapshot | null;
  activationMode: 'toggle' | 'hold';
  triggerAccelerator: string | null;
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
    initialActiveProfile,
  } = options;
  const [isOpen, setIsOpen] = useState(false);
  
  // CRITICAL: In hold mode, we need a way to bypass protection for keyup handler
  // This flag allows keyup handler to close menu even in hold mode
  const allowCloseInHoldModeRef = useRef(false);
  
  // Get activation mode - need to compute this early to use in setIsOpenSafe
  // Note: activeProfile is not available yet at this point, so we'll use a ref to update it later
  const resolvedActivationModeRef = useRef<'toggle' | 'hold'>('toggle');
  const resolvedActivationMode = useMemo<'toggle' | 'hold'>(() => {
    if (activationModeOverride) {
      const mode = activationModeOverride;
      resolvedActivationModeRef.current = mode;
      return mode;
    }
    if (profileHoldToOpen !== undefined) {
      const mode = profileHoldToOpen ? 'hold' : 'toggle';
      resolvedActivationModeRef.current = mode;
      return mode;
    }
    // Will be updated when activeProfile is available
    return resolvedActivationModeRef.current;
  }, [activationModeOverride, profileHoldToOpen]);
  
  // Protected wrapper for setIsOpen - prevents closing menu too soon after opening
  // CRITICAL: In hold mode, this function BLOCKS ALL closes except from keyup handler
  const setIsOpenSafe = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const currentValue = isOpenRef.current;
    const newValue = typeof value === 'function' ? value(currentValue) : value;
    
    // CRITICAL: In hold mode, if menu is open, NEVER close it except from keyup events
    // This prevents any other logic from closing the menu while key is held
    // Use ref to get current value (updated when activeProfile changes)
    const isHoldMode = resolvedActivationModeRef.current === 'hold';
    if (!newValue && currentValue && isHoldMode && !allowCloseInHoldModeRef.current) {
      const timeSinceOpen = Date.now() - (lastToggleAtRef.current ?? 0);
      if (timeSinceOpen < 150) {
        return;
      }
    }
    
    // Toggle mode: allow immediate close on second hotkey press.
    // Protection against too-early close is handled where necessary (e.g., safe mode/conflict timers).
    
    // If opening, update timestamp and immediately update ref
    if (newValue && !currentValue) {
      lastToggleAtRef.current = Date.now();
      // CRITICAL: Update ref immediately before state update
      isOpenRef.current = true;
    }
    
    // If closing, update ref immediately
    if (!newValue && currentValue) {
      isOpenRef.current = false;
    }
    
    setIsOpen(newValue);
  }, []); // No dependencies - use ref for current value
  
  const clearTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  
  // Function for keyup handler to close menu in hold mode (bypasses protection)
  const closeMenuFromKeyUp = useCallback(() => {
    allowCloseInHoldModeRef.current = true;
    lastClosedAtRef.current = Date.now();
    setIsOpen(false);
    clearTimer();
    allowCloseInHoldModeRef.current = false;
  }, [clearTimer]);
  
  // Keep ref in sync with state for checks
  useEffect(() => {
    isOpenRef.current = isOpen;
    // Reset processed time when menu closes to allow new events
    if (!isOpen) {
      lastHotkeyProcessedRef.current = 0;
    }
  }, [isOpen]);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastActionState | null>(null);
  const [lastSafeModeReason, setLastSafeModeReason] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ActiveProfileSnapshot | null>(initialActiveProfile ?? null);
  const [activationMode, setActivationMode] = useState<'toggle' | 'hold'>(resolvedActivationModeRef.current);
  const [triggerAccelerator, setTriggerAccelerator] = useState<string | null>(null);
  const activeProfileRef = useRef<ActiveProfileSnapshot | null>(initialActiveProfile ?? null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHotkeyEventAtRef = useRef<number>(0);
  const lastToggleAtRef = useRef<number>(0);
  const lastClosedAtRef = useRef<number>(0);
  const conflictCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeHoldHotkeyRef = useRef<ParsedHotkey | null>(null);
  const lastToastRef = useRef<{ id: string; timestamp: number } | null>(null);
  const isOpenRef = useRef<boolean>(false);
  const activeHotkeyAcceleratorRef = useRef<string | null>(null);
  const pressedKeysInHoldModeRef = useRef<Set<string>>(new Set());
  const lastHotkeyProcessedRef = useRef<number>(0);
  const isProcessingHotkeyRef = useRef<boolean>(false);
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

  const recordActionMetric = useAppStore((state) => state.recordActionMetric);

  const parsedFallbackHotkeys = useMemo<ParsedHotkey[]>(() => {
    const candidates = Array.isArray(fallbackHotkey) ? fallbackHotkey : [fallbackHotkey];
    return candidates
      .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
      .filter((candidate): candidate is string => candidate.length > 0)
      .map((candidate) => parseHotkey(candidate))
      .filter((parsed): parsed is ParsedHotkey => parsed != null);
  }, [fallbackHotkey]);

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
      setLastAction({
        actionId: payload.id,
        actionName: payload.name,
        status: payload.status,
        message: payload.message ?? null,
        timestamp,
        durationMs: payload.durationMs ?? null,
        invocationId: payload.invocationId ?? null,
      });

      recordActionMetric({
        actionId: payload.id,
        actionName: payload.name,
        status: payload.status,
        message: payload.message ?? null,
        timestamp,
        durationMs: payload.durationMs ?? null,
        invocationId: payload.invocationId ?? null,
      });
    },
    [recordActionMetric],
  );

  const mockHotkeyDialogMode = useMemo(() => {
    if (isTauriEnvironment() || typeof window === 'undefined') {
      return 'normal';
    }
    const value = new URL(window.location.href).searchParams.get('mockHotkeyDialog');
    if (!value) {
      return 'off';
    }
    const normalized = value.toLowerCase();
    if (['strict', 'on', 'true', '1', 'dialog'].includes(normalized)) {
      return 'strict';
    }
    if (['auto', 'normal', 'default'].includes(normalized)) {
      return 'normal';
    }
    return 'off';
  }, []);

  const mockHotkeyDialog = useMemo(
    () => !isTauriEnvironment() && mockHotkeyDialogMode !== 'strict',
    [mockHotkeyDialogMode],
  );

  const bypassHotkeyConflicts = mockHotkeyDialog;
  const resolvedConflictDialogOpen = bypassHotkeyConflicts ? false : hasConflictDialogOpen;
  const resolvedHotkeyConflicts = bypassHotkeyConflicts ? false : hasHotkeyConflicts;

  // Compute safe mode reason from systemStore (for E2E tests compatibility)
  const currentSafeModeReason = useMemo(() => {
    if (!isTauriEnvironment()) {
      const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
      const safeModeParam = url?.searchParams.get('mockSafeMode') ?? null;
      const safeModeIgnoreParam = url?.searchParams.get('mockSafeModeIgnore') ?? null;

      const shouldIgnoreSafeMode = (() => {
        if (safeModeIgnoreParam) {
          const normalized = safeModeIgnoreParam.toLowerCase();
          return ['1', 'true', 'yes', 'on'].includes(normalized);
        }
        if (!safeModeParam) {
          // Default to ignoring safe mode in mocked web runs unless explicitly enabled
          return true;
        }
        const normalized = safeModeParam.toLowerCase();
        if (['off', '0', 'false', 'ignore', 'disabled'].includes(normalized)) {
          return true;
        }
        if (['on', '1', 'true', 'strict', 'enabled'].includes(normalized)) {
          return false;
        }
        return true;
      })();

      if (shouldIgnoreSafeMode) {
        return null;
      }

      if (systemWindowSnapshot.isFullscreen) {
        return 'Fullscreen application detected. Pie menu is paused to avoid interference.';
      }
      return lastSafeModeReason;
    }

    if (systemWindowSnapshot.isFullscreen) {
      return 'Fullscreen application detected. Pie menu is paused to avoid interference.';
    }
    if (lastSafeModeReason) {
      return lastSafeModeReason;
    }
    return null;
  }, [lastSafeModeReason, systemWindowSnapshot.isFullscreen]);

  const hasConflictDialogOpenRef = useRef(resolvedConflictDialogOpen);
  useEffect(() => {
    hasConflictDialogOpenRef.current = resolvedConflictDialogOpen;
  }, [resolvedConflictDialogOpen]);

  const hasHotkeyConflictsRef = useRef(resolvedHotkeyConflicts);
  useEffect(() => {
    hasHotkeyConflictsRef.current = resolvedHotkeyConflicts;
  }, [resolvedHotkeyConflicts]);

  const currentSafeModeReasonRef = useRef(currentSafeModeReason);
  useEffect(() => {
    currentSafeModeReasonRef.current = currentSafeModeReason;
  }, [currentSafeModeReason]);
  
  // Get activation mode - moved here to be available for all callbacks
  // This was moved from below to fix initialization order
  

  const scheduleAutoClose = useCallback(() => {
    clearTimer();
    if (autoCloseMs > 0) {
      // CRITICAL: In hold mode, NEVER schedule auto-close - menu closes only on key release
      const isHoldMode = resolvedActivationModeRef.current === 'hold';
      if (isHoldMode) {
        return; // Don't schedule auto-close in hold mode
      }
      
      // Don't schedule auto-close if menu was just opened
      const timeSinceOpen = Date.now() - (lastToggleAtRef.current ?? 0);
      const delay = Math.max(autoCloseMs, 500 - timeSinceOpen); // Ensure at least 500ms total
      closeTimerRef.current = setTimeout(() => {
        // Double-check protection before closing
        const timeSinceOpenCheck = Date.now() - (lastToggleAtRef.current ?? 0);
        if (timeSinceOpenCheck >= 500) {
          setIsOpenSafe(false);
        }
        closeTimerRef.current = null;
      }, delay);
    }
  }, [autoCloseMs, clearTimer, resolvedActivationMode]);

  // Clear timer when menu closes, but don't interfere with opening
  useEffect(() => {
    if (!isOpen) {
      clearTimer();
    }
  }, [clearTimer, isOpen]);

  useEffect(() => {
    if (resolvedConflictDialogOpen || resolvedHotkeyConflicts) {
      if (conflictCloseTimerRef.current) {
        clearTimeout(conflictCloseTimerRef.current);
      }
      // Only close if menu is actually open
      if (isOpen) {
        // Check protection time before scheduling close
        const timeSinceOpen = Date.now() - (lastToggleAtRef.current ?? 0);
        const delay = Math.max(250, 500 - timeSinceOpen); // Ensure at least 500ms total
        conflictCloseTimerRef.current = setTimeout(() => {
          // Double-check protection before closing
          const timeSinceOpenCheck = Date.now() - (lastToggleAtRef.current ?? 0);
          if (timeSinceOpenCheck >= 500) {
            clearTimer();
            setIsOpenSafe(false);
            lastToggleAtRef.current = Date.now();
          }
          conflictCloseTimerRef.current = null;
        }, delay);
      }
      return;
    }

    if (conflictCloseTimerRef.current) {
      clearTimeout(conflictCloseTimerRef.current);
      conflictCloseTimerRef.current = null;
    }
  }, [clearTimer, resolvedConflictDialogOpen, resolvedHotkeyConflicts, isOpen]);

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
      lastClosedAtRef.current = Date.now();
      setIsOpenSafe(false);
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
        if (mockHotkeyDialog) return;
        const isHoldMode = resolvedActivationModeRef.current === 'hold';
        if (!isHoldMode && (matchers.some((match) => match(event)) || event.key === 'Escape')) {
          event.preventDefault();
          clearMenuState();
        }
        return;
      }

      const isHoldMode = resolvedActivationModeRef.current === 'hold';
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
          setIsOpenSafe(true);
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
        
        // Toggle только на ту же комбинацию, что открыла меню
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

      const isHoldMode = resolvedActivationModeRef.current === 'hold';
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
        closeMenuFromKeyUp();
      }
    };

    const handleBlur = () => {
      // CRITICAL: Don't close menu on blur - it causes menu to disappear immediately
      // Only clear pressed keys, but don't close menu
      // The menu should only close from user actions or hotkey release
      pressedKeysRef.current.clear();
      // Don't close menu on window blur - it's too aggressive
    };

    const toggleEvent = () => {
      if (hasConflictDialogOpen || hasHotkeyConflicts) {
        if (mockHotkeyDialog) return;
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
      if (resolvedConflictDialogOpen || resolvedHotkeyConflicts) {
        if (mockHotkeyDialog) return;
        clearMenuState();
        return;
      }
      setIsOpenSafe(true);
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
    resolvedConflictDialogOpen,
    resolvedHotkeyConflicts,
    currentSafeModeReason,
    parsedFallbackHotkeys,
    recordActionOutcome,
    scheduleAutoClose,
    resolvedActivationMode, // Use resolvedActivationMode from useMemo instead of isHoldMode
    mockHotkeyDialog,
  ]);

  useEffect(() => {
    let isMounted = true;
    let hotkeyUnlisten: (() => void) | undefined;
    let executedUnlisten: (() => void) | undefined;
    let failedUnlisten: (() => void) | undefined;
    let aggregatedUnlisten: (() => void) | undefined;
    let windowUnlisten: (() => void) | undefined;
    let storageModeUnlisten: (() => void) | undefined;
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
          // Cache active trigger accelerator upfront for hold-mode keyup detection
          try {
            const hotkeys = (await invokeFn('list_hotkeys')) as Array<{ id: string; accelerator: string; event: string }>;
            const triggerHotkey = hotkeys.find((h) => h.event === hotkeyEvent);
            activeHotkeyAcceleratorRef.current = triggerHotkey?.accelerator ?? null;
            setTriggerAccelerator(triggerHotkey?.accelerator ?? null);
          } catch (error) {
            console.error('Failed to cache trigger accelerator', error);
          }
        } catch (error) {
          console.error('Failed to initialize action events channel', error);
        }
      }

      // CRITICAL: Don't call resolve_active_profile here - it's a heavy operation
      // This was causing the menu to disappear immediately after opening
      // The profile will be resolved by the profile router and sent via events
      // Just wait for the profile event instead

      profileUnlisten = await listen<{ profile: ActiveProfileSnapshot | null }>(
        'profiles://active-changed',
        (event) => {
          setActiveProfile(event.payload.profile ?? null);
        },
      );

      hotkeyUnlisten = await listen<HotkeyEventPayload>(hotkeyEvent, (event) => {
        const payload = event.payload;
        const shortcutId = payload?.id ?? null;
        const acceleratorFromPayload = payload?.accelerator?.trim() || null;

        if (acceleratorFromPayload) {
          activeHotkeyAcceleratorRef.current = acceleratorFromPayload;
          setTriggerAccelerator(acceleratorFromPayload);
        }

        const profileIdFromPayload =
          shortcutId && shortcutId.startsWith('profile:') ? shortcutId.slice('profile:'.length) : null;
        if (profileIdFromPayload) {
          const profileState = useProfileStore.getState();
          const { profiles, activeProfileId } = profileState;
          const profileIndex = profiles.findIndex((record) => record.profile.id === profileIdFromPayload);
          if (profileIndex !== -1) {
            const record = profiles[profileIndex];
            const snapshot: ActiveProfileSnapshot = {
              index: profileIndex,
              name: record.profile.name,
              matchKind: 'custom',
              holdToOpen: record.profile.holdToOpen ?? false,
            };
            activeProfileRef.current = snapshot;
            setActiveProfile(snapshot);
          }

          if (activeProfileId !== profileIdFromPayload) {
            const invokeFn = getTauriInvoke();
            if (invokeFn) {
              invokeFn('activate_profile', { profileId: profileIdFromPayload }).catch((error) => {
                console.error('Failed to activate profile for hotkey trigger', error);
              });
            }
          }
        }

        const now = Date.now();

        // Prevent concurrent processing - if already processing, ignore
        if (isProcessingHotkeyRef.current) {
          return;
        }
        
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
        
        // Check conflicts before processing
        if (hasConflictDialogOpenRef.current || hasHotkeyConflictsRef.current) {
          if (mockHotkeyDialog) return;
          // Don't close if menu was just opened
          const timeSinceOpen = now - (lastToggleAtRef.current ?? 0);
          if (timeSinceOpen >= 500) {
            clearTimer();
            setIsOpenSafe(false);
          }
          return;
        }
        
        // Current state
        const currentIsOpen = isOpenRef.current;
        const isHoldMode = resolvedActivationModeRef.current === 'hold';

        // Toggle mode: if already open, close and start cooldown
        if (currentIsOpen) {
          if (isHoldMode) {
            return;
          }
          lastClosedAtRef.current = now;
          clearTimer();
          setIsOpenSafe(false);
          isProcessingHotkeyRef.current = true;
          setTimeout(() => {
            isProcessingHotkeyRef.current = false;
          }, HOTKEY_DEBOUNCE_MS);
          return;
        }

        // If just closed, ignore immediate re-trigger to avoid reopen flicker
        const sinceClosed = now - (lastClosedAtRef.current ?? 0);
        if (sinceClosed < REOPEN_COOLDOWN_MS) {
          return;
        }

        // Menu is closed - open it
        // Mark as processing BEFORE any async operations
        isProcessingHotkeyRef.current = true;
        
        const timeSinceLastProcessed = now - (lastHotkeyProcessedRef.current ?? 0);
        if (timeSinceLastProcessed < 200) {
          isProcessingHotkeyRef.current = false;
          return;
        }
        
        lastHotkeyProcessedRef.current = now;
        lastHotkeyEventAtRef.current = now;
        
        // isHoldMode is already determined above
        
        // CRITICAL: Update ref immediately BEFORE opening menu
        // This ensures that if another hotkey event comes immediately, it will see menu as open
        isOpenRef.current = true;
        lastToggleAtRef.current = now;
        
        // CRITICAL: Open menu immediately without any async operations
        // Don't call resolve_active_profile here - it's heavy and causes delays
        setIsOpenSafe(true);
        
        // CRITICAL: Don't schedule auto-close immediately - wait a bit to prevent menu from disappearing
        if (isHoldMode) {
          // Don't schedule auto-close in hold mode - keyup events will close it
          // CRITICAL: In hold mode, menu must stay open until key is released
          // No timers, no auto-close, nothing
        } else {
          // Delay auto-close scheduling to prevent immediate closure
          setTimeout(() => {
            if (isOpenRef.current && autoCloseMs > 0) {
              scheduleAutoClose();
            }
          }, 100);
        }
        
        // Allow next processing after a short delay
        // But in hold mode, keep processing blocked longer to prevent rapid-fire events
        setTimeout(() => {
          isProcessingHotkeyRef.current = false;
        }, isHoldMode ? 200 : 50); // Longer delay in hold mode
      });

      if (!aggregatorReady) {
        executedUnlisten = await listen<ActionEventPayload>('actions://executed', (event) => {
          handleActionEvent(event.payload);
        });

        failedUnlisten = await listen<ActionEventPayload>('actions://failed', (event) => {
          handleActionEvent(event.payload);
        });
      }

      windowUnlisten = await listen<WindowSnapshot>('system://window-info', (event) => {
        const { isFullscreen } = event.payload;
        if (isFullscreen) {
          setLastSafeModeReason('Fullscreen application detected. Pie menu is paused to avoid interference.');
        } else {
          setLastSafeModeReason(null);
        }
      });

      storageModeUnlisten = await listen<{ mode: StorageMode }>('system://storage-mode', (event) => {
        if (event.payload.mode === 'read_only') {
          setLastSafeModeReason('Storage is read-only. Pie menu is paused until write access is restored.');
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
      storageModeUnlisten?.();
      profileUnlisten?.();
    };
  }, [autoCloseMs, clearTimer, hotkeyEvent, recordActionOutcome, scheduleAutoClose, mockHotkeyDialog]);

  // In hold mode, track keyup events to close menu when trigger keys are released
  // This works like kando - we listen to keyup events on document
  useEffect(() => {
    if (!isTauriEnvironment() || resolvedActivationModeRef.current !== 'hold') {
      return;
    }

    let isMounted = true;

    // Get the active hotkey string when menu opens
    const getActiveHotkey = async () => {
      try {
        const invokeFn = getTauriInvoke();
        if (invokeFn) {
          const hotkeys = await invokeFn('list_hotkeys') as Array<{ id: string; accelerator: string; event: string }>;
          const triggerHotkey = hotkeys.find(h => h.event === hotkeyEvent);
          return triggerHotkey?.accelerator || null;
        }
      } catch (e) {
        console.error('Failed to get active hotkey', e);
      }
      return null;
    };

    const normalizeKey = (key: string): string => {
      const lower = key.toLowerCase();
      if (lower === ' ' || lower === 'space' || lower === 'spacebar') return 'space';
      if (lower === 'ctrl' || lower === 'control') return 'control';
      if (lower === 'shift') return 'shift';
      if (lower === 'alt') return 'alt';
      if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win') return 'meta';
      return lower;
    };

    const parseHotkeyParts = (accelerator: string): Set<string> => {
      const parts = accelerator.toLowerCase().split('+').map(p => normalizeKey(p.trim()));
      return new Set(parts);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpenRef.current || !isMounted) return;
      
      // Track all pressed keys
      const key = event.key?.toLowerCase() || event.code?.toLowerCase();
      if (key) {
        pressedKeysInHoldModeRef.current.add(normalizeKey(key));
      }
      
      // Track modifiers from event state
      if (event.ctrlKey) pressedKeysInHoldModeRef.current.add('control');
      if (event.shiftKey) pressedKeysInHoldModeRef.current.add('shift');
      if (event.altKey) pressedKeysInHoldModeRef.current.add('alt');
      if (event.metaKey) pressedKeysInHoldModeRef.current.add('meta');
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isOpenRef.current || !isMounted) return;
      
      // Remove released key
      const key = event.key?.toLowerCase() || event.code?.toLowerCase();
      if (key) {
        pressedKeysInHoldModeRef.current.delete(normalizeKey(key));
      }
      
      // Update modifiers based on current state
      if (!event.ctrlKey) pressedKeysInHoldModeRef.current.delete('control');
      if (!event.shiftKey) pressedKeysInHoldModeRef.current.delete('shift');
      if (!event.altKey) pressedKeysInHoldModeRef.current.delete('alt');
      if (!event.metaKey) pressedKeysInHoldModeRef.current.delete('meta');
      
      // Check if all trigger keys are released
      const activeHotkey = activeHotkeyAcceleratorRef.current;
      if (activeHotkey) {
        const requiredKeys = parseHotkeyParts(activeHotkey);
        const allKeysStillPressed = Array.from(requiredKeys).every(key => 
          pressedKeysInHoldModeRef.current.has(key)
        );
        
        if (!allKeysStillPressed) {
          // All trigger keys released - close menu
          // CRITICAL: In hold mode, this is the ONLY way menu should close
          // Use special function that bypasses protection
          closeMenuFromKeyUp();
          pressedKeysInHoldModeRef.current.clear();
        }
      }
    };

    // Set up listeners when menu opens
    if (isOpen) {
      getActiveHotkey().then(accelerator => {
        if (isMounted && accelerator) {
          activeHotkeyAcceleratorRef.current = accelerator;
          setTriggerAccelerator(accelerator);
          // Initialize with current pressed keys
          document.addEventListener('keydown', handleKeyDown);
          document.addEventListener('keyup', handleKeyUp);
        }
      });
    } else {
      // Clean up when menu closes
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      pressedKeysInHoldModeRef.current.clear();
      activeHotkeyAcceleratorRef.current = null;
      setTriggerAccelerator(null);
    }

    return () => {
      isMounted = false;
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      pressedKeysInHoldModeRef.current.clear();
      activeHotkeyAcceleratorRef.current = null;
      setTriggerAccelerator(null);
    };
  }, [isOpen, resolvedActivationMode, hotkeyEvent, clearTimer]);

  useEffect(() => {
    if (isTauriEnvironment()) {
      return;
    }

    const profiles = profileStoreState.profiles;

    const selectFromRecord = (record: (typeof profiles)[number] | undefined, index: number, matchKind: ActiveProfileSnapshot['matchKind']) => {
      if (!record) {
        return null;
      }
      return {
        index,
        name: record.profile.name,
        matchKind,
        holdToOpen: record.profile.holdToOpen ?? false,
      } satisfies ActiveProfileSnapshot;
    };

    let snapshot: ActiveProfileSnapshot | null = null;

    if (initialActiveProfile) {
      snapshot = selectFromRecord(profiles[initialActiveProfile.index], initialActiveProfile.index, initialActiveProfile.matchKind);
      if (snapshot) {
        snapshot = { ...snapshot, holdToOpen: initialActiveProfile.holdToOpen ?? snapshot.holdToOpen };
      }
    }

    if (!snapshot && profileStoreState.activeProfileId) {
      const index = profiles.findIndex((entry) => entry.profile.id === profileStoreState.activeProfileId);
      snapshot = selectFromRecord(profiles[index], index, 'fallback');
    }

    if (!snapshot && profiles.length) {
      snapshot = selectFromRecord(profiles[0], 0, 'fallback');
    }

    setActiveProfile(snapshot);
  }, [initialActiveProfile, profileStoreState.activeProfileId, profileStoreState.profiles]);

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
        if (mockHotkeyDialog) return prev;
        clearTimer();
        return false;
      }

      const next = !prev;
      if (next) {
        lastToggleAtRef.current = now;
        scheduleAutoClose();
      } else {
        lastToggleAtRef.current = now;
        lastClosedAtRef.current = now;
        clearTimer();
      }
      return next;
    });
  }, [clearTimer, currentSafeModeReason, resolvedConflictDialogOpen, resolvedHotkeyConflicts, recordActionOutcome, scheduleAutoClose]);

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
    
    if (resolvedConflictDialogOpen || resolvedHotkeyConflicts) {
      clearTimer();
      setIsOpenSafe(false);
      return;
    }
    setIsOpenSafe(true);
    scheduleAutoClose();
  }, [currentSafeModeReason, resolvedConflictDialogOpen, resolvedHotkeyConflicts, recordActionOutcome, scheduleAutoClose, setIsOpenSafe]);

  const close = useCallback(() => {
    lastClosedAtRef.current = Date.now();
    setIsOpenSafe(false);
    clearTimer();
  }, [clearTimer, setIsOpenSafe]);

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
        setIsOpenSafe(false);
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
      activationMode,
      triggerAccelerator,
      toggle,
      open,
      close,
      setActiveSlice: setActiveSliceId,
      handleSelect,
      clearLastAction,
      recordActionOutcome,
    }),
    [
      activationMode,
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
      triggerAccelerator,
    ],
  );
}
