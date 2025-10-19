import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTauriEnvironment } from '@/utils/tauriEnvironment';
import type { PieSliceDefinition } from '@/components/pie/PieMenu';

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

interface ActionEventPayload {
  id: string;
  name: string;
  status: 'success' | 'failure' | 'skipped';
  message?: string | null;
}

interface WindowEventPayload {
  isFullscreen: boolean;
  storageMode: 'readWrite' | 'readOnly' | string;
}

export interface LastActionState {
  status: ActionEventPayload['status'];
  message: string | null;
  actionId: string;
  actionName: string;
  timestamp: string;
}

export interface UsePieMenuHotkeyOptions {
  hotkeyEvent?: string;
  autoCloseMs?: number;
  fallbackHotkey?: string;
}

export interface PieMenuHotkeyState {
  isOpen: boolean;
  activeSliceId: string | null;
  lastAction: LastActionState | null;
  lastSafeModeReason: string | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveSlice: (sliceId: string | null) => void;
  handleSelect: (sliceId: string, slice?: PieSliceDefinition) => void;
  clearLastAction: () => void;
  recordActionOutcome: (payload: {
    id: string;
    name: string;
    status: ActionEventPayload['status'];
    message?: string | null;
  }) => void;
}

export function usePieMenuHotkey(options: UsePieMenuHotkeyOptions = {}): PieMenuHotkeyState {
  const {
    hotkeyEvent = 'hotkeys://trigger',
    autoCloseMs = 0,
    fallbackHotkey = 'Control+Shift+P',
  } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastActionState | null>(null);
  const [lastSafeModeReason, setLastSafeModeReason] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const recordActionOutcome = useCallback(
    (payload: {
      id: string;
      name: string;
      status: ActionEventPayload['status'];
      message?: string | null;
    }) => {
      setLastAction({
        status: payload.status,
        message: payload.message ?? null,
        actionId: payload.id,
        actionName: payload.name,
        timestamp: new Date().toISOString(),
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

  useEffect(() => {
    if (!isTauriEnvironment()) {
      const matchHotkey = createHotkeyMatcher(fallbackHotkey);

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.repeat) {
          return;
        }
        if (matchHotkey(event)) {
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
          setIsOpen(false);
          clearTimer();
        }
      };

      const toggleEvent = () => {
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
        setIsOpen(true);
        scheduleAutoClose();
      };

      const closeEvent = () => {
        setIsOpen(false);
        clearTimer();
      };

      const actionEvent = (event: Event) => {
        const detail = (event as CustomEvent<{
          id?: string;
          name?: string;
          status?: ActionEventPayload['status'];
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
  }, [clearTimer, fallbackHotkey, recordActionOutcome, scheduleAutoClose]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    let isMounted = true;
    let hotkeyUnlisten: (() => void) | undefined;
    let executedUnlisten: (() => void) | undefined;
    let failedUnlisten: (() => void) | undefined;
    let windowUnlisten: (() => void) | undefined;

    const setup = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      if (!isMounted) {
        return;
      }

      hotkeyUnlisten = await listen(hotkeyEvent, () => {
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            scheduleAutoClose();
          } else {
            clearTimer();
          }
          return next;
        });
      });

      executedUnlisten = await listen<ActionEventPayload>('actions://executed', (event) => {
        const payload = event.payload;
        recordActionOutcome({
          id: payload.id,
          name: payload.name,
          status: payload.status,
          message: payload.message ?? null,
        });
      });

      failedUnlisten = await listen<ActionEventPayload>('actions://failed', (event) => {
        const payload = event.payload;
        recordActionOutcome({
          id: payload.id,
          name: payload.name,
          status: 'failure',
          message: payload.message ?? null,
        });
      });

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
      failedUnlisten?.();
      windowUnlisten?.();
    };
  }, [clearTimer, hotkeyEvent, recordActionOutcome, scheduleAutoClose]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        scheduleAutoClose();
      } else {
        clearTimer();
      }
      return next;
    });
  }, [clearTimer, scheduleAutoClose]);

  const open = useCallback(() => {
    setIsOpen(true);
    scheduleAutoClose();
  }, [scheduleAutoClose]);

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
      toggle,
      open,
      close,
      setActiveSlice,
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
