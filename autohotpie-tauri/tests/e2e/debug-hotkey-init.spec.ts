import { test, expect } from '@playwright/test';

test('verify hotkey initialization', async ({ page }) => {
  console.log('>> Navigating to page with hotkey parameter');
  await page.goto('/?mockSafeModeIgnore=1&mockHotkeyDialog=off&pieHotkey=Control%2BShift%2BP');
  
  console.log('>> Waiting for inline script execution');
  const initialized = await page.evaluate(() => {
    return {
      initialized: (window as any).__PIE_HOTKEY_INITIALIZED__,
      matchers: (window as any).__PIE_HOTKEY_MATCHERS__,
      url: window.location.href,
    };
  });
  
  console.log('>> Initialization result:', initialized);
  expect(initialized.initialized).toBe(true);
  expect(initialized.matchers).toEqual(['control+shift+p']);
});
