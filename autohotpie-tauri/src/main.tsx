import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Initialize __PIE_HOTKEY_MATCHERS__ for Playwright E2E tests
// This runs as soon as this module loads, before React renders
(function() {
  console.log('[main.tsx] Initializing __PIE_HOTKEY_MATCHERS__...');
  
  try {
    let hotkey = null;
    
    // Try to get from URL query parameters
    try {
      const url = new URL(window.location.href);
      hotkey = url.searchParams.get('pieHotkey');
      if (hotkey && hotkey.trim().length > 0) {
        console.log('[main.tsx] Found pieHotkey in URL:', hotkey);
      }
    } catch (e) {
      console.log('[main.tsx] Failed to parse URL:', e);
    }
    
    // Fallback to sessionStorage
    if (!hotkey || hotkey.trim().length === 0) {
      try {
        const stored = sessionStorage.getItem('_pieHotkey');
        if (stored && stored.trim().length > 0) {
          hotkey = stored;
          console.log('[main.tsx] Found pieHotkey in sessionStorage:', hotkey);
        }
      } catch {
        // ignore
      }
    }
    
    if (hotkey && hotkey.trim().length > 0) {
      const normalized = hotkey.trim().toLowerCase();
      (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__ = [normalized];
      console.log('[main.tsx] ✓ Set window.__PIE_HOTKEY_MATCHERS__ =', (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__);
      
      // Store in sessionStorage for persistence
      try {
        sessionStorage.setItem('_pieHotkey', hotkey.trim());
      } catch {
        // ignore
      }
    } else {
      // Default to Control+Shift+P for tests
      (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__ = ['control+shift+p'];
      console.log('[main.tsx] ✓ Set DEFAULT window.__PIE_HOTKEY_MATCHERS__ =', (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__);
    }
  } catch (e) {
    console.error('[main.tsx] Error initializing __PIE_HOTKEY_MATCHERS__:', e);
  }
})();

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
