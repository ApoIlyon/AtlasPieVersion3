import { expect, Page, test } from '@playwright/test';

type ImportExportStoreShimState = {
  importBundle: (bundle: string) => Promise<unknown>;
  exportProfiles: (ids?: string[]) => Promise<unknown>;
  saveBundle: (filename: string, contents: string) => Promise<unknown>;
  lastBundle: string | null;
  lastExportedAt?: string | null;
  error?: string | null;
  isExporting?: boolean;
  isImporting?: boolean;
};

type ImportExportStoreShim = {
  getState: () => ImportExportStoreShimState;
  setState: (
    partial:
      | Partial<ImportExportStoreShimState>
      | ((state: ImportExportStoreShimState) => Partial<ImportExportStoreShimState>),
  ) => void;
};

type ProfileStoreShimState = {
  setProfiles: (payload: {
    schemaVersion: number;
    profiles: unknown[];
    activeProfileId: string | null;
    migratedFromSettings: string | null;
  }) => void;
  profiles: unknown[];
};

type ProfileStoreShim = {
  getState: () => ProfileStoreShimState;
};

function stubDesktopImportExport(page: Page) {
  return page.addInitScript(() => {
    const win = window as typeof window & {
      __TAURI__?: Record<string, unknown>;
      __AUTOHOTPIE_IMPORT_EXPORT_STORE__?: ImportExportStoreShim;
      __AUTOHOTPIE_PROFILE_STORE__?: ProfileStoreShim;
    };

    const profilesPayload = {
      schemaVersion: 1,
      profiles: [
        {
          profile: {
            id: 'test-profile-id',
            name: 'Test Profile',
            description: null,
            enabled: true,
            globalHotkey: null,
            activationRules: [],
            rootMenu: 'menu-1',
          },
          menus: [
            {
              id: 'menu-1',
              title: 'Menu',
              appearance: { radius: 200, innerRadius: 80, fontSize: 16 },
              slices: [],
            },
          ],
          actions: [],
          createdAt: null,
          updatedAt: null,
        },
      ],
      activeProfileId: 'test-profile-id',
      migratedFromSettings: null,
    };

    const patchProfileStore = (store: NonNullable<typeof win.__AUTOHOTPIE_PROFILE_STORE__>) => {
      const state = store.getState();
      state.setProfiles({
        schemaVersion: profilesPayload.schemaVersion,
        profiles: profilesPayload.profiles,
        activeProfileId: profilesPayload.activeProfileId,
        migratedFromSettings: profilesPayload.migratedFromSettings,
      });
    };

    if (win.__AUTOHOTPIE_PROFILE_STORE__) {
      patchProfileStore(win.__AUTOHOTPIE_PROFILE_STORE__);
    } else {
      let profileStoreRef: typeof win.__AUTOHOTPIE_PROFILE_STORE__ = undefined;
      Object.defineProperty(win, '__AUTOHOTPIE_PROFILE_STORE__', {
        configurable: true,
        get() {
          return profileStoreRef;
        },
        set(value) {
          profileStoreRef = value;
          if (value) {
            patchProfileStore(value);
          }
          Object.defineProperty(win, '__AUTOHOTPIE_PROFILE_STORE__', {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
        },
      });
    }

    const invokeStub = async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case 'list_profiles':
          return profilesPayload;
        case 'export_profiles':
          return { data: 'eyJwcm9maWxlcyI6W119' };
        case 'import_profiles':
          return { importedProfiles: 0, skippedProfiles: 0, warnings: [] };
        case 'save_export_bundle':
          return null;
        default:
          return null;
      }
    };

    Object.defineProperty(win, '__TAURI__', {
      value: {
        core: {
          invoke: invokeStub,
        },
        event: {
          listen: async () => () => {
            /* no-op */
          },
        },
      },
      configurable: true,
    });

  });
}

test.describe('Import/Export negative flows', () => {
  async function ensureProfilesLoaded(page: Page) {
    const success = await page
      .waitForFunction(() => {
        const win = window as typeof window & {
          __AUTOHOTPIE_PROFILE_STORE__?: {
            getState: () => { profiles: { length: number } };
          };
        };
        const store = win.__AUTOHOTPIE_PROFILE_STORE__;
        return Boolean(store && store.getState().profiles.length > 0);
      }, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!success) {
      await page.evaluate(() => {
        const win = window as typeof window & {
          __AUTOHOTPIE_PROFILE_STORE__?: {
            getState: () => {
              setProfiles: (payload: {
                schemaVersion: number;
                profiles: unknown[];
                activeProfileId: string | null;
                migratedFromSettings: string | null;
              }) => void;
              profiles: unknown[];
            };
          };
        };
        const store = win.__AUTOHOTPIE_PROFILE_STORE__;
        if (!store) {
          return;
        }
        const state = store.getState();
        if (state.profiles.length === 0 && typeof state.setProfiles === 'function') {
          state.setProfiles({
            schemaVersion: 1,
            profiles: [
              {
                profile: {
                  id: 'fallback-profile',
                  name: 'Fallback Profile',
                  description: null,
                  enabled: true,
                  globalHotkey: null,
                  activationRules: [],
                  rootMenu: 'fallback-menu',
                },
                menus: [
                  {
                    id: 'fallback-menu',
                    title: 'Menu',
                    appearance: { radius: 150, innerRadius: 75, fontSize: 16 },
                    slices: [],
                  },
                ],
                actions: [],
                createdAt: null,
                updatedAt: null,
              },
            ],
            activeProfileId: 'fallback-profile',
            migratedFromSettings: null,
          });
        }
      });
      await page.waitForFunction(() => {
        const win = window as typeof window & {
          __AUTOHOTPIE_PROFILE_STORE__?: {
            getState: () => { profiles: { length: number } };
          };
        };
        const store = win.__AUTOHOTPIE_PROFILE_STORE__;
        return Boolean(store && store.getState().profiles.length > 0);
      });
    }
  }

  test('surfaces export error toast when backend export fails', async ({ page }) => {
    await stubDesktopImportExport(page);

    const errorMessage = 'failed to export profiles: disk full';

    await page.addInitScript(({ message }) => {
      const win = window as typeof window & {
        __AUTOHOTPIE_IMPORT_EXPORT_STORE__?: ImportExportStoreShim;
      };

      const patch = (store: ImportExportStoreShim) => {
        const original = store.getState().exportProfiles;
        store.setState({
          exportProfiles: async (...args: Parameters<typeof original>) => {
            store.setState({ isExporting: true, error: null });
            await Promise.resolve();
            store.setState({ isExporting: false, error: message });
            throw new Error(message);
          },
        });
      };

      if (win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__) {
        patch(win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__);
        return;
      }

      let storeRef: typeof win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__ = undefined;
      Object.defineProperty(win, '__AUTOHOTPIE_IMPORT_EXPORT_STORE__', {
        configurable: true,
        get() {
          return storeRef;
        },
        set(value) {
          storeRef = value;
          if (value) {
            patch(value);
          }
          Object.defineProperty(win, '__AUTOHOTPIE_IMPORT_EXPORT_STORE__', {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
        },
      });
    }, { message: errorMessage });

    await page.goto('/');

    await page.getByRole('button', { name: 'Settings' }).click();
    await ensureProfilesLoaded(page);

    const exportAllButton = page.getByRole('button', { name: 'Export all profiles' });
    await expect(exportAllButton).toBeVisible();
    await expect(exportAllButton).toBeEnabled();

    await exportAllButton.click();

    const errorBanner = page.getByText(errorMessage, { exact: false }).first();
    await expect(errorBanner).toBeVisible();
  });

  test('shows import failure message when bundle processing rejects', async ({ page }) => {
    await stubDesktopImportExport(page);

    const importError = 'bundle rejected: schema mismatch';

    await page.addInitScript(({ message }) => {
      const win = window as typeof window & {
        __AUTOHOTPIE_IMPORT_EXPORT_STORE__?: ImportExportStoreShim;
      };

      const patch = (store: ImportExportStoreShim) => {
        store.setState({
          importBundle: async () => {
            store.setState({ isImporting: true, error: null });
            await Promise.resolve();
            store.setState({ isImporting: false, error: message });
            throw new Error(message);
          },
        });
      };

      if (win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__) {
        patch(win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__);
        return;
      }

      let storeRef: typeof win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__ = undefined;
      Object.defineProperty(win, '__AUTOHOTPIE_IMPORT_EXPORT_STORE__', {
        configurable: true,
        get() {
          return storeRef;
        },
        set(value) {
          storeRef = value;
          if (value) {
            patch(value);
          }
          Object.defineProperty(win, '__AUTOHOTPIE_IMPORT_EXPORT_STORE__', {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
        },
      });
    }, { message: importError });

    await page.goto('/');

    await page.getByRole('button', { name: 'Settings' }).click();
    await ensureProfilesLoaded(page);

    const textarea = page.getByPlaceholder('Paste bundle JSON here or use the file picker');
    await textarea.fill('{"schema_version":99}');

    await page.getByRole('button', { name: 'Import bundle' }).click();

    const errorBanner = page.getByText(importError, { exact: false }).first();
    await expect(errorBanner).toBeVisible();
  });

  test('handles save bundle failure gracefully', async ({ page }) => {
    await stubDesktopImportExport(page);

    const failureMessage = 'failed to save export bundle: access denied';

    await page.addInitScript(({ message }) => {
      const win = window as typeof window & {
        __AUTOHOTPIE_IMPORT_EXPORT_STORE__?: ImportExportStoreShim;
      };

      const patch = (store: ImportExportStoreShim) => {
        store.setState({
          saveBundle: async () => {
            store.setState({ error: message });
            throw new Error(message);
          },
        });
      };

      if (win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__) {
        patch(win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__);
        return;
      }

      let storeRef: typeof win.__AUTOHOTPIE_IMPORT_EXPORT_STORE__ = undefined;
      Object.defineProperty(win, '__AUTOHOTPIE_IMPORT_EXPORT_STORE__', {
        configurable: true,
        get() {
          return storeRef;
        },
        set(value) {
          storeRef = value;
          if (value) {
            patch(value);
          }
          Object.defineProperty(win, '__AUTOHOTPIE_IMPORT_EXPORT_STORE__', {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
        },
      });
    }, { message: failureMessage });

    await page.goto('/');

    await page.getByRole('button', { name: 'Settings' }).click();
    await ensureProfilesLoaded(page);

    const exportButton = page.getByRole('button', { name: 'Export all profiles' });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
    await exportButton.click();

    await expect(page.getByRole('button', { name: 'Download JSON' })).toBeDisabled();
    await expect(page.getByText(failureMessage, { exact: false })).toBeVisible();
  });
});
