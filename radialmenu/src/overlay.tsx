import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/tauri';
import { listen, emit, UnlistenFn } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';
import RadialMenu from './components/RadialMenu';
import type { BackendRadialConfig, HoldShortcutPayload, MenuItem, RadialConfig } from './types';
import { DEFAULT_CONFIG, fromBackendConfig } from './types';
import './overlay.css';

const normalizeShortcutPart = (part: string): string => {
  const lower = part.trim().toLowerCase();
  switch (lower) {
    case 'ctrl':
    case 'control':
    case 'commandorcontrol':
      return 'control';
    case 'command':
    case 'cmd':
    case 'super':
    case 'win':
    case 'windows':
    case 'meta':
      return 'meta';
    case 'alt':
    case 'option':
      return 'alt';
    case 'shift':
      return 'shift';
    default:
      return lower;
  }
};

const normalizeEventKey = (key: string): string => {
  const lower = key.toLowerCase();
  switch (lower) {
    case 'control':
    case 'ctrl':
      return 'control';
    case 'meta':
    case 'command':
    case 'super':
      return 'meta';
    case 'alt':
    case 'option':
      return 'alt';
    case 'shift':
      return 'shift';
    default:
      return lower;
  }
};

const parseShortcutParts = (shortcut: string): string[] =>
  shortcut
    .split('+')
    .map(normalizeShortcutPart)
    .filter((part) => part.length > 0);

const OverlayApp: React.FC = () => {
  const [config, setConfig] = useState<RadialConfig>(DEFAULT_CONFIG);
  const holdActiveRef = useRef(false);
  const holdShortcutPartsRef = useRef<string[]>([]);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isCancelled = false;

    const fetchConfig = async () => {
      try {
        const response = await invoke<BackendRadialConfig>('load_config');
        if (!isCancelled) {
          setConfig(fromBackendConfig(response));
        }
      } catch (error) {
        console.error('Не удалось загрузить конфигурацию для оверлея', error);
      }
    };

    fetchConfig();

    const listeners: Promise<UnlistenFn>[] = [
      listen<BackendRadialConfig>('config-updated', (event) => {
        const payload = event.payload;
        if (payload) {
          setConfig(fromBackendConfig(payload));
        }
      }),
      listen<boolean>('radial-shortcut-toggle', (event) => {
        if (!event.payload && config.activationMode !== 'hold') {
          appWindow.hide().catch((err) => console.error('Не удалось скрыть окно', err));
        }
      }),
      listen<HoldShortcutPayload>('radial-shortcut-hold', (event) => {
        const payload = event.payload;
        if (!payload) {
          return;
        }
        if (payload.active) {
          const parts = parseShortcutParts(payload.shortcut);
          holdShortcutPartsRef.current = parts;
          pressedKeysRef.current = new Set(parts);
          holdActiveRef.current = true;
        } else {
          holdActiveRef.current = false;
          holdShortcutPartsRef.current = [];
          pressedKeysRef.current.clear();
          appWindow.hide().catch((err) => console.error('Не удалось скрыть окно', err));
        }
      }),
    ];

    return () => {
      isCancelled = true;
      listeners.forEach((promise) => {
        promise.then((off) => off()).catch(() => undefined);
      });
    };
  }, []);

  const hideOverlay = useCallback(
    async (origin: 'user' | 'auto' = 'user') => {
      try {
        holdActiveRef.current = false;
        holdShortcutPartsRef.current = [];
        pressedKeysRef.current.clear();
        await appWindow.hide();
        await emit('radial-shortcut-toggle', false);
        if (config.activationMode === 'hold') {
          await emit('radial-shortcut-hold', { active: false, shortcut: config.shortcut });
        }
      } catch (error) {
        console.error('Не удалось скрыть окно радиального меню', error);
      }
    }, [config.activationMode, config.shortcut]
  );

  useEffect(() => {
    if (config.activationMode !== 'hold') {
      holdActiveRef.current = false;
      holdShortcutPartsRef.current = [];
      pressedKeysRef.current.clear();
      return () => undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!holdActiveRef.current) {
        return;
      }
      const key = normalizeEventKey(event.key);
      if (!holdShortcutPartsRef.current.includes(key)) {
        return;
      }
      pressedKeysRef.current.add(key);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!holdActiveRef.current) {
        return;
      }
      const key = normalizeEventKey(event.key);
      if (!holdShortcutPartsRef.current.includes(key)) {
        return;
      }
      pressedKeysRef.current.delete(key);
      const stillPressed = holdShortcutPartsRef.current.some((part) =>
        pressedKeysRef.current.has(part)
      );
      if (!stillPressed) {
        holdActiveRef.current = false;
        holdShortcutPartsRef.current = [];
        pressedKeysRef.current.clear();
        hideOverlay('auto');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [config.activationMode, hideOverlay]);

  const handleItemClick = useCallback(
    async (item: MenuItem) => {
      if (item.command) {
        try {
          await invoke('execute_command', { command: item.command });
        } catch (error) {
          console.error('Не удалось выполнить команду пункта меню', error);
        }
      }

      hideOverlay();
    },
    [hideOverlay]
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        hideOverlay();
      }
    },
    [hideOverlay]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        hideOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hideOverlay]);

  return (
    <div className="overlay-shell" onClick={handleBackdropClick}>
      <div className="overlay-menu">
        <RadialMenu config={config} onItemClick={handleItemClick} />
      </div>
    </div>
  );
};

const rootElement = document.getElementById('overlay-root');

if (!rootElement) {
  throw new Error('Не удалось найти контейнер overlay-root');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
);
