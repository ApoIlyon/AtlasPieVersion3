import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import { useProfileStore } from './profileStore';
import { useAppStore } from './appStore';

interface ExportResponse {
  data: string;
}

export interface ImportResult {
  importedProfiles: number;
  skippedProfiles: number;
  warnings: string[];
}

interface ImportExportState {
  isExporting: boolean;
  isImporting: boolean;
  lastBundle: string | null;
  lastImportResult: ImportResult | null;
  lastExportedAt: string | null;
  error: string | null;
  exportProfiles: (profileIds?: string[]) => Promise<string | null>;
  importBundle: (bundle: string) => Promise<ImportResult | null>;
  saveBundle: (filename: string, contents: string) => Promise<string | null>;
  clearStatus: () => void;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export const useImportExportStore = create<ImportExportState>((set, get) => ({
  isExporting: false,
  isImporting: false,
  lastBundle: null,
  lastImportResult: null,
  lastExportedAt: null,
  error: null,
  async exportProfiles(profileIds) {
    if (!isTauriEnvironment()) {
      const message = 'Import/export is only available in the desktop app.';
      set({ error: message });
      throw new Error(message);
    }

    set({ isExporting: true, error: null });
    try {
      const request = profileIds && profileIds.length > 0 ? { profileIds } : null;
      const response = await invoke<ExportResponse>('export_profiles', {
        request,
      });
      const exportedAt = new Date().toISOString();
      set({ lastBundle: response.data, lastExportedAt: exportedAt });
      return response.data;
    } catch (error) {
      const message = toMessage(error);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isExporting: false });
    }
  },
  async importBundle(bundle) {
    if (!isTauriEnvironment()) {
      const message = 'Import/export is only available in the desktop app.';
      set({ error: message });
      throw new Error(message);
    }

    set({ isImporting: true, error: null });
    try {
      const result = await invoke<ImportResult>('import_profiles', {
        payload: { data: bundle },
      });
      set({ lastImportResult: result, lastBundle: null });

      // Refresh frontend stores to reflect backend changes.
      const profileStore = useProfileStore.getState();
      await profileStore.refreshProfiles();
      const appStore = useAppStore.getState();
      await appStore.loadSettings();

      return result;
    } catch (error) {
      const message = toMessage(error);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isImporting: false });
    }
  },
  async saveBundle(filename, contents) {
    if (!isTauriEnvironment()) {
      return null;
    }

    try {
      const savedPath = await invoke<string | null>('save_export_bundle', {
        payload: { filename, contents },
      });
      return savedPath ?? null;
    } catch (error) {
      const message = toMessage(error);
      set({ error: message });
      throw new Error(message);
    }
  },
  clearStatus() {
    set({ lastBundle: null, lastImportResult: null, error: null });
  },
}));

if (typeof window !== 'undefined') {
  (window as typeof window & { __AUTOHOTPIE_IMPORT_EXPORT_STORE__?: typeof useImportExportStore }).__AUTOHOTPIE_IMPORT_EXPORT_STORE__ =
    useImportExportStore;
}
