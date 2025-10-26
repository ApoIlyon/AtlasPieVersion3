import { test, expect } from '@playwright/test';
import ruPackJson from '../../src-tauri/resources/localization/ru.json' assert { type: 'json' };

type LocalizationPack = {
  language: string;
  version: string;
  strings: Record<string, string>;
  missingKeys: string[];
};

const RU_LOCALIZATION_PACK: LocalizationPack = {
  language: ruPackJson.language ?? 'ru',
  version: ruPackJson.version ?? '0.0.0',
  strings: ruPackJson.strings ?? {},
  missingKeys: [],
};

const waitForHeading = async (page: import('@playwright/test').Page, name: string) => {
  await expect(page.getByRole('banner').getByRole('heading', { name })).toBeVisible();
};

test.describe('Localization switching', () => {
  test('renders translated strings for EN and RU packs', async ({ page }) => {
    await page.goto('/');

    await waitForHeading(page, 'Pie Menu Studio');
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() =>
          Boolean(
            (window as typeof window & {
              __AUTOHOTPIE_LOCALIZATION_STORE__?: { getState: () => { initialized: boolean } };
            }).__AUTOHOTPIE_LOCALIZATION_STORE__?.getState().initialized,
          ),
        ),
      )
      .toBeTruthy();

    await page.evaluate((pack) => {
      const store = (window as typeof window & {
        __AUTOHOTPIE_LOCALIZATION_STORE__?: {
          getState: () => {
            applyPack: (p: LocalizationPack, languages?: string[]) => void;
            languages: string[];
            fallbackLanguage: string;
          } & { initialized: boolean; currentLanguage: string };
        };
      }).__AUTOHOTPIE_LOCALIZATION_STORE__;

      if (store) {
        const state = store.getState();
        state.applyPack(pack, [...new Set([...state.languages, 'en', pack.language])]);
      }
    }, RU_LOCALIZATION_PACK);

    await waitForHeading(page, 'Студия Pie-меню');
    await expect(page.getByRole('button', { name: 'Панель' })).toBeVisible();

    await page.evaluate(() => {
      const store = (window as typeof window & {
        __AUTOHOTPIE_LOCALIZATION_STORE__?: {
          getState: () => {
            applyPack: (pack: LocalizationPack, languages?: string[]) => void;
            packs: Record<string, LocalizationPack>;
            fallbackLanguage: string;
            languages: string[];
            currentLanguage: string;
          };
        };
      }).__AUTOHOTPIE_LOCALIZATION_STORE__;

      if (store) {
        const state = store.getState();
        const fallback = state.packs[state.fallbackLanguage] ?? {
          language: state.fallbackLanguage,
          version: '0.0.0',
          strings: {},
          missingKeys: [],
        };
        state.applyPack(fallback, [...new Set([...state.languages, state.fallbackLanguage])]);
      }
    });

    await waitForHeading(page, 'Pie Menu Studio');
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  });
});
