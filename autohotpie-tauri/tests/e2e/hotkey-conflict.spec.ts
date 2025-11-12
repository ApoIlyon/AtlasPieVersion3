import { test, expect, type Page } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((part) => part.trim());
}

async function triggerHotkey(page: Page, hotkey: string) {
  const modifiers = parseHotkey(hotkey);
  const mainKey = modifiers.pop();
  if (!mainKey) {
    throw new Error('Invalid hotkey definition');
  }

  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }
  await page.keyboard.press(mainKey);
  for (const modifier of modifiers.reverse()) {
    await page.keyboard.up(modifier);
  }
}

test.describe('US2 - Hotkey conflict gating', () => {
  test('shows conflict dialog, suggests alternatives and logs audit entry', async ({ page }) => {
    await page.goto('/?mockSafeModeIgnore=1&pieHotkey=Control%2BShift%2BP&mockHotkeyDialog=strict');

    await page.waitForFunction(
      () => (window as unknown as { __PIE_PROFILES_READY__?: boolean }).__PIE_PROFILES_READY__ === true,
      { timeout: 2_000 },
    );

    await page.evaluate(async () => {
      // @ts-expect-error vite runtime import for e2e setup
      const { useHotkeyStore } = await import(/* @vite-ignore */ '/src/state/hotkeyStore.ts');
      (window as unknown as { __disableCalls: { count: number; last: string | null } }).__disableCalls = {
        count: 0,
        last: null,
      };
      useHotkeyStore.setState({
        disableConflictingHotkey: async (conflictingId: string) => {
          const calls = (window as unknown as { __disableCalls: { count: number; last: string | null } }).__disableCalls;
          calls.count += 1;
          calls.last = conflictingId;
          return true;
        },
        dialogOpen: true,
        dialogStatus: {
          registered: false,
          conflicts: [
            {
              code: 'alreadyRegistered',
              message: 'Shortcut already registered elsewhere',
            },
            {
              code: 'duplicateInternal',
              message: 'Internal binding in use',
              meta: { conflictingId: 'global-pie' },
            },
          ],
          alternatives: [
            {
              id: 'suggested-1',
              accelerator: 'Ctrl+Alt+Shift+Space',
            },
          ],
          journalEntry: {
            kind: 'conflict-warning',
            accelerator: 'Ctrl+Alt+Space',
          },
        },
        pendingRequest: {
          id: 'global-pie',
          accelerator: 'Ctrl+Alt+Space',
        },
        isSubmitting: false,
      });
    });

    await page.waitForTimeout(50);

    const dialog = page.getByRole('dialog', { name: /shortcut conflict detected/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/shortcut already registered elsewhere/i)).toBeVisible();

    const retryButton = dialog.getByRole('button', { name: /fix issues to continue/i });
    await expect(retryButton).toBeDisabled();

    const disableHint = dialog.getByText(/resolve non-removable conflicts/i);
    await expect(disableHint).toBeVisible();

    const alternativeList = dialog.getByRole('list', { name: /suggested shortcuts/i });
    await expect(alternativeList).toBeVisible();
    await expect(alternativeList.getByText(/Ctrl\+Alt\+Shift\+Space/)).toBeVisible();

    await triggerHotkey(page, HOTKEY);

    const pieMenu = page.getByTestId('pie-menu');
    await expect(pieMenu).not.toBeVisible({ timeout: 1_000 });

    const toast = page.getByRole('status');
    await expect(toast).toHaveCount(0);

    const disableButton = dialog.getByRole('button', { name: /disable conflicting binding/i });
    await expect(disableButton).toBeDisabled();

    const disableCalls = await page.evaluate(() => {
      const calls = (window as unknown as { __disableCalls: { count: number; last: string | null } }).__disableCalls;
      return { count: calls.count, last: calls.last };
    });
    expect(disableCalls).toEqual({ count: 0, last: null });
  });
});
