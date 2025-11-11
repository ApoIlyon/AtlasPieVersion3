import { beforeEach, describe, expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useProfileStore } from '../profileStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../utils/tauriEnvironment', () => ({
  isTauriEnvironment: () => true,
}));

describe('profileStore recovery flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const store = useProfileStore.getState();
    useProfileStore.setState({
      profiles: [],
      activeProfileId: null,
      isLoading: false,
      error: null,
      validationErrors: [],
      initialized: true,
      recovery: {
        message: 'corrupted json',
        filePath: 'C:/AppData/profiles.v1.json',
        backupsDir: 'C:/AppData/backups/profiles',
      },
    });
  });

  test('openRecoveryBackups invokes backend command', async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await useProfileStore.getState().openRecoveryBackups();

    expect(invoke).toHaveBeenCalledWith('open_profiles_backups');
  });

  test('retryRecoveryLoad clears recovery state on success', async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      profiles: [],
      schemaVersion: 1,
    });

    await useProfileStore.getState().retryRecoveryLoad();

    expect(useProfileStore.getState().recovery).toBeNull();
    expect(invoke).toHaveBeenCalledWith('list_profiles');
  });

  test('acknowledgeRecovery clears recovery flag', async () => {
    await useProfileStore.getState().acknowledgeRecovery();

    expect(useProfileStore.getState().recovery).toBeNull();
  });
});
