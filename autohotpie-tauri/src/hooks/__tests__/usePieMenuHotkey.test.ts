import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePieMenuHotkey } from '../usePieMenuHotkey';
import { useAppStore } from '@/state/appStore';

vi.mock('@/utils/tauriEnvironment', () => ({
  isTauriEnvironment: () => false,
}));

describe('usePieMenuHotkey (fallback mode)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useAppStore.getState().resetActionMetrics();
  });

  test('toggles visibility via fallback hotkey', () => {
    const { result } = renderHook(() =>
      usePieMenuHotkey({ fallbackHotkey: 'Control+Shift+P', autoCloseMs: 0 }),
    );

    expect(result.current.isOpen).toBe(false);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'P',
          code: 'KeyP',
          ctrlKey: true,
          shiftKey: true,
        }),
      );
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'P',
          code: 'KeyP',
          ctrlKey: true,
          shiftKey: true,
        }),
      );
    });

    expect(result.current.isOpen).toBe(false);
  });

  test('updates lastAction when action events are received', () => {
    const { result } = renderHook(() =>
      usePieMenuHotkey({ fallbackHotkey: 'Control+Shift+P', autoCloseMs: 0 }),
    );

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('pie-menu:action', {
          detail: {
            id: 'action-1',
            name: 'Sample Action',
            status: 'success',
            message: 'All good',
          },
        }),
      );
    });

    expect(result.current.lastAction).toBeTruthy();
    expect(result.current.lastAction?.status).toBe('success');
    expect(result.current.lastAction?.actionName).toBe('Sample Action');
    expect(result.current.isOpen).toBe(false);

    const store = useAppStore.getState();
    expect(store.lastActionSummary?.actionId).toBe('action-1');
    expect(store.actionOutcomeCounts.total).toBe(1);
    expect(store.actionOutcomeCounts.success).toBe(1);
  });
});
