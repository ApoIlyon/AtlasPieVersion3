import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { AuditLogRecord, AuditLogSnapshot } from '@/types/logs';

const DEFAULT_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'ACTION'];
const REFRESH_LIMIT = 500;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'ACTION' | string;

interface LogState {
  entries: AuditLogRecord[];
  filtered: AuditLogRecord[];
  filePath: string | null;
  truncated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  search: string;
  activeLevels: LogLevel[];
  autoRefresh: boolean;
  lastUpdated: string | null;
  setSearch: (value: string) => void;
  toggleLevel: (level: LogLevel) => void;
  setAutoRefresh: (value: boolean) => void;
  clearError: () => void;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  hydrateFromSnapshot: (snapshot: AuditLogSnapshot) => void;
}

function filterEntries(
  entries: AuditLogRecord[],
  search: string,
  activeLevels: LogLevel[],
): AuditLogRecord[] {
  const needle = search.trim().toLowerCase();
  const hasSearch = needle.length > 0;
  const levelSet = new Set(activeLevels.map((level) => level.toLowerCase()));

  return entries.filter((entry) => {
    if (activeLevels.length && !levelSet.has(entry.level.toLowerCase())) {
      return false;
    }
    if (!hasSearch) {
      return true;
    }
    return (
      entry.message.toLowerCase().includes(needle) ||
      entry.raw.toLowerCase().includes(needle) ||
      entry.level.toLowerCase().includes(needle)
    );
  });
}

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  filtered: [],
  filePath: null,
  truncated: false,
  isLoading: false,
  isRefreshing: false,
  error: null,
  search: '',
  activeLevels: [...DEFAULT_LEVELS],
  autoRefresh: true,
  lastUpdated: null,
  setSearch(value) {
    set((state) => ({
      search: value,
      filtered: filterEntries(state.entries, value, state.activeLevels),
    }));
  },
  toggleLevel(level) {
    set((state) => {
      const levelLower = level.toLowerCase();
      const isActive = state.activeLevels.some((value) => value.toLowerCase() === levelLower);
      const nextLevels = isActive
        ? state.activeLevels.filter((value) => value.toLowerCase() !== levelLower)
        : [...state.activeLevels, level];
      const filtered = filterEntries(state.entries, state.search, nextLevels);
      return {
        activeLevels: nextLevels,
        filtered,
      };
    });
  },
  setAutoRefresh(value) {
    set({ autoRefresh: value });
  },
  clearError() {
    set({ error: null });
  },
  hydrateFromSnapshot(snapshot) {
    const filtered = filterEntries(snapshot.entries, get().search, get().activeLevels);
    set({
      entries: snapshot.entries,
      filtered,
      truncated: snapshot.truncated,
      filePath: snapshot.file_path ?? snapshot.filePath ?? null,
      lastUpdated: new Date().toISOString(),
    });
  },
  async refresh(options) {
    if (!isTauriEnvironment()) {
      set({
        error: 'Log panel доступен только в десктопной сборке.',
        entries: [],
        filtered: [],
        filePath: null,
        truncated: false,
        isLoading: false,
        isRefreshing: false,
      });
      return;
    }

    const { silent = false } = options ?? {};
    set((state) => ({
      isLoading: silent ? state.isLoading : true,
      isRefreshing: silent ? true : state.isRefreshing,
      error: null,
    }));

    try {
      const snapshot = await invoke<AuditLogSnapshot>('read_logs', { limit: REFRESH_LIMIT });
      get().hydrateFromSnapshot(snapshot);
      set({ isLoading: false, isRefreshing: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({
        error: message,
        isLoading: false,
        isRefreshing: false,
      });
    }
  },
}));

if (typeof window !== 'undefined') {
  (window as typeof window & { __AUTOHOTPIE_LOG_STORE__?: typeof useLogStore }).__AUTOHOTPIE_LOG_STORE__ =
    useLogStore;
}
