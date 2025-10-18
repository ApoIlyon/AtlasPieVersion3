import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTauriEnvironment } from '@/utils/tauriEnvironment';

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
  handleSelect: (sliceId: string) => void;
  clearLastAction: () => void;
}

export function usePieMenuHotkey(options: UsePieMenuHotkeyOptions = {}): PieMenuHotkeyState {
  const { hotkeyEvent = 'hotkeys://trigger', autoCloseMs = 0 } = options;
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
        setLastAction({
          status: payload.status,
          message: payload.message ?? null,
          actionId: payload.id,
          actionName: payload.name,
          timestamp: new Date().toISOString(),
        });
        if (payload.status === 'success') {
          scheduleAutoClose();
        }
      });

      failedUnlisten = await listen<ActionEventPayload>('actions://failed', (event) => {
        const payload = event.payload;
        setLastAction({
          status: 'failure',
          message: payload.message ?? null,
          actionId: payload.id,
          actionName: payload.name,
          timestamp: new Date().toISOString(),
        });
        setIsOpen(false);
        clearTimer();
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
  }, [hotkeyEvent, scheduleAutoClose, clearTimer]);

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
    (sliceId: string) => {
      setActiveSliceId(sliceId);
      if (autoCloseMs === 0) {
        setIsOpen(false);
      } else {
        scheduleAutoClose();
      }
    },
    [autoCloseMs, scheduleAutoClose],
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
      setActiveSlice,
      toggle,
    ],
  );
}
