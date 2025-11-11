import { beforeEach, describe, expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useLogStore } from '../logStore';
import { isTauriEnvironment } from '../../utils/tauriEnvironment';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../utils/tauriEnvironment', () => ({
  isTauriEnvironment: vi.fn(),
}));

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

type AuditLogEntry = Mutable<ReturnType<(typeof useLogStore)['getState']>['entries'][number]>;

type AuditLogSnapshot = Parameters<ReturnType<(typeof useLogStore)['getState']>['hydrateFromSnapshot']>[0];

const invokeMock = vi.mocked(invoke);
const isTauriEnvironmentMock = vi.mocked(isTauriEnvironment);

function resetStore() {
  useLogStore.setState({
    entries: [],
    filtered: [],
    filePath: null,
    truncated: false,
    isLoading: false,
    isRefreshing: false,
    error: null,
    search: '',
    activeLevels: ['INFO', 'WARN', 'ERROR', 'ACTION'],
    autoRefresh: true,
    lastUpdated: null,
  });
}

function createSnapshot(entries: AuditLogEntry[], overrides?: Partial<AuditLogSnapshot>): AuditLogSnapshot {
  return {
    entries,
    file_path: 'C:/logs/AHP-Audit-2025-10-30.log',
    truncated: false,
    ...overrides,
  };
}

describe('useLogStore', () => {
  beforeEach(() => {
    resetStore();
    invokeMock.mockReset();
    isTauriEnvironmentMock.mockReset();
    isTauriEnvironmentMock.mockReturnValue(true);
  });

  test('filters entries by level and search term', () => {
    const snapshot = createSnapshot([
      {
        timestamp: '2025-10-30T14:00:00Z',
        level: 'INFO',
        message: 'Startup complete',
        raw: 'INFO Startup complete',
      },
      {
        timestamp: '2025-10-30T14:01:00Z',
        level: 'ERROR',
        message: 'Disk failure detected',
        raw: 'ERROR Disk failure detected',
      },
      {
        timestamp: '2025-10-30T14:02:00Z',
        level: 'ACTION',
        message: 'User triggered export',
        raw: 'ACTION export',
      },
    ]);

    useLogStore.getState().hydrateFromSnapshot(snapshot);

    expect(useLogStore.getState().filtered).toHaveLength(3);

    useLogStore.getState().toggleLevel('INFO');
    expect(useLogStore.getState().filtered.map((entry) => entry.level)).toEqual(['ERROR', 'ACTION']);

    useLogStore.getState().setSearch('disk');
    const filtered = useLogStore.getState().filtered;
    expect(filtered).toHaveLength(1);
    expect(filtered[0].level).toBe('ERROR');
  });

  test('refresh surfaces backend errors and can clear them', async () => {
    invokeMock.mockRejectedValue(new Error('permission denied'));

    await useLogStore.getState().refresh();

    const state = useLogStore.getState();
    expect(invokeMock).toHaveBeenCalledWith('read_logs', { limit: 500 });
    expect(state.error).toBe('permission denied');
    expect(state.isLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);

    state.clearError();
    expect(useLogStore.getState().error).toBeNull();
  });

  test('refresh applies desktop guard outside tauri environment', async () => {
    isTauriEnvironmentMock.mockReturnValue(false);

    await useLogStore.getState().refresh();

    const state = useLogStore.getState();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(state.error).toBe('Log panel доступен только в десктопной сборке.');
    expect(state.entries).toHaveLength(0);
    expect(state.filtered).toHaveLength(0);
    expect(state.isLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);
  });
});
