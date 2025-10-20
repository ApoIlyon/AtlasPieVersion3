import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { HotkeyConflictDialog } from '../HotkeyConflictDialog';
import type { HotkeyConflictDialogProps } from '../HotkeyConflictDialog';
import type { HotkeyRegistrationStatus } from '@/types/hotkeys';

describe('HotkeyConflictDialog', () => {
  function renderDialog(overrides: Partial<HotkeyConflictDialogProps> = {}) {
    const status: HotkeyRegistrationStatus = overrides.status ?? {
      registered: false,
      conflicts: [],
    };

    const props: HotkeyConflictDialogProps = {
      isOpen: true,
      status,
      isSubmitting: false,
      onClose: vi.fn(),
      ...overrides,
    } as HotkeyConflictDialogProps;

    render(<HotkeyConflictDialog {...props} />);

    return props;
  }

  test('returns null when dialog is closed or status missing', () => {
    const { container } = render(
      <HotkeyConflictDialog isOpen={false} status={null} isSubmitting={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders conflict messages and disables retry when blocking conflicts are present', () => {
    renderDialog({
      onDisable: vi.fn(),
      status: {
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
      },
    });

    expect(screen.getByRole('dialog', { name: /shortcut conflict detected/i })).toBeVisible();
    expect(screen.getByText(/shortcut already registered elsewhere/i)).toBeVisible();

    const retryButton = screen.getByRole('button', { name: /fix issues to continue/i });
    expect(retryButton).toBeDisabled();

    const disableButton = screen.getByRole('button', { name: /disable conflicting binding/i });
    expect(disableButton).toBeDisabled();
  });

  test('allows retry and invokes callbacks when only internal conflicts remain', async () => {
    const onRetry = vi.fn().mockResolvedValue(true);
    const onDisable = vi.fn().mockResolvedValue(true);

    renderDialog({
      onRetry,
      onDisable,
      status: {
        registered: false,
        conflicts: [
          {
            code: 'duplicateInternal',
            message: 'Internal binding in use',
            meta: { conflictingId: 'global-pie' },
          },
        ],
      },
    });

    const retryButton = screen.getByRole('button', { name: /apply override & register/i });
    expect(retryButton).toBeEnabled();

    await userEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const disableButton = screen.getByRole('button', { name: /disable conflicting binding/i });
    await userEvent.click(disableButton);
    expect(onDisable).toHaveBeenCalledWith('global-pie');
  });
});
