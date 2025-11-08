import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { RadialMenu } from './components/radial/RadialMenu';
import { DEFAULT_RADIAL_CONFIG } from './components/radial/types';
import type { MenuItem, RadialConfig } from './components/radial/types';
import './overlay.css';

const HIDE_EVENT = 'radial-overlay://hide';
const CONFIG_UPDATE_EVENT = 'radial-overlay://config-updated';
const overlayWindow = getCurrentWindow();

type BackendRadialConfig = {
  radius: number;
  itemSize: number;
  spacing: number;
  shortcut: string;
  activationMode?: string;
  items: Array<{ id: string; label: string; command?: string | null; color?: string | null }>;
};

function normalizeConfig(payload: BackendRadialConfig): RadialConfig {
  return {
    radius: payload.radius,
    itemSize: payload.itemSize,
    spacing: payload.spacing,
    shortcut: payload.shortcut,
    activationMode: (payload.activationMode as RadialConfig['activationMode']) ?? 'toggle',
    items: payload.items.map((item) => ({
      id: item.id,
      label: item.label,
      command: item.command ?? undefined,
      color: item.color ?? undefined,
    })),
  };
}

async function notifyHidden() {
  try {
    await invoke('radial_overlay_notify_hidden');
  } catch (error) {
    console.warn('Failed to notify backend about overlay hide', error);
  }
}

async function hideOverlay() {
  await notifyHidden();
  await overlayWindow.hide();
}

function OverlayApp() {
  const [config, setConfig] = useState<RadialConfig>(DEFAULT_RADIAL_CONFIG);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const payload = await invoke<BackendRadialConfig>('radial_overlay_get_config');
        setConfig(normalizeConfig(payload));
      } catch (error) {
        console.warn('Failed to load radial overlay config, using defaults', error);
      }
    };

    void loadConfig();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void hideOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const hidePromise = listen(HIDE_EVENT, () => {
      void hideOverlay();
    });

    const configPromise = listen<BackendRadialConfig>(CONFIG_UPDATE_EVENT, (event) => {
      if (event.payload) {
        setConfig(normalizeConfig(event.payload));
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      void hidePromise.then((unlisten) => {
        if (typeof unlisten === 'function') {
          unlisten();
        }
      });
      void configPromise.then((unlisten) => {
        if (typeof unlisten === 'function') {
          unlisten();
        }
      });
    };
  }, []);

  const handleBackdropClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      void hideOverlay();
    }
  }, []);

  const handleSelect = useCallback(async (item: MenuItem) => {
    try {
      await invoke('radial_overlay_select_item', { itemId: item.id });
    } catch (error) {
      console.error('Failed to notify radial overlay selection', error);
    }
    void hideOverlay();
  }, []);

  return (
    <div className="radial-overlay-backdrop" onClick={handleBackdropClick}>
      <div className="radial-overlay-stage" onClick={(event) => event.stopPropagation()}>
        <RadialMenu config={config} onItemClick={handleSelect} />
      </div>
    </div>
  );
}

const container = document.getElementById('overlay-root');

if (!container) {
  throw new Error('Radial overlay root element not found');
}

createRoot(container).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
