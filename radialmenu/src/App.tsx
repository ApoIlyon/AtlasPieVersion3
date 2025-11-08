import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import RadialMenu from './components/RadialMenu';
import type { MenuItem, RadialConfig, BackendRadialConfig, ActivationMode } from './types';
import { DEFAULT_CONFIG, fromBackendConfig, toBackendConfig } from './types';

interface LoadState {
  loading: boolean;
  error: string | null;
}

const App: React.FC = () => {
  const [config, setConfig] = useState<RadialConfig>(DEFAULT_CONFIG);
  const [persistedConfig, setPersistedConfig] = useState<RadialConfig>(DEFAULT_CONFIG);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(DEFAULT_CONFIG.items[0]?.id ?? null);
  const [{ loading, error }, setLoadState] = useState<LoadState>({ loading: true, error: null });
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      setLoadState({ loading: true, error: null });
      try {
        const response = await invoke<BackendRadialConfig>('load_config');
        if (cancelled) {
          return;
        }
        const normalized = fromBackendConfig(response);
        setConfig(normalized);
        setPersistedConfig(normalized);
        setSelectedItemId(normalized.items[0]?.id ?? null);
        setLoadState({ loading: false, error: null });
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Не удалось загрузить конфигурацию';
        setLoadState({ loading: false, error: message });
      }
    };

    fetchConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedItem = useMemo(() => config.items.find((item) => item.id === selectedItemId) ?? null, [config.items, selectedItemId]);

  const isDirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(persistedConfig), [config, persistedConfig]);

  const updateConfig = useCallback(<K extends keyof RadialConfig>(key: K, value: RadialConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<MenuItem>) => {
    setConfig((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const handleAddItem = useCallback(() => {
    const newItem: MenuItem = {
      id: `item-${crypto.randomUUID?.() ?? Date.now()}`,
      label: 'Новый пункт',
      command: null,
      color: '#38bdf8',
    };

    setConfig((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setSelectedItemId(newItem.id);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setConfig((prev) => {
      const filtered = prev.items.filter((item) => item.id !== id);
      return {
        ...prev,
        items: filtered,
      };
    });
    setSelectedItemId((current) => (current === id ? null : current));
  }, []);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setPersistedConfig(DEFAULT_CONFIG);
    setSelectedItemId(DEFAULT_CONFIG.items[0]?.id ?? null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const backendPayload = toBackendConfig(config);
      await invoke('save_config', { config: backendPayload });
      await invoke('register_shortcut', {
        shortcut: config.shortcut,
        activationMode: config.activationMode,
      });
      setPersistedConfig(config);
      setStatusMessage('Сохранено');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Не удалось сохранить настройки';
      setStatusMessage(message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 2600);
    }
  }, [config]);

  const handleSelectItem = useCallback((item: MenuItem) => {
    setSelectedItemId(item.id);
  }, []);

  if (loading) {
    return (
      <main className="app-shell" style={{ placeItems: 'center', minHeight: '420px' }}>
        <p>Загрузка конфигурации...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell" style={{ placeItems: 'center', minHeight: '420px' }}>
        <div className="empty-state">
          <strong>Ошибка</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setLoadState({ loading: true, error: null })}>
            Повторить попытку
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="radial-stage">
        <RadialMenu config={config} onItemClick={handleSelectItem} />
      </section>

      <aside className="controls">
        <h2>Радиальное меню</h2>

        <fieldset>
          <legend>Геометрия</legend>
          <label>
            Радиус (px)
            <input
              type="range"
              min={80}
              max={240}
              value={config.radius}
              onChange={(event) => updateConfig('radius', Number(event.target.value))}
            />
            <span>{config.radius.toFixed(0)}</span>
          </label>
          <label>
            Размер элемента (px)
            <input
              type="range"
              min={36}
              max={120}
              value={config.itemSize}
              onChange={(event) => updateConfig('itemSize', Number(event.target.value))}
            />
            <span>{config.itemSize.toFixed(0)}</span>
          </label>
          <label>
            Отступ (px)
            <input
              type="range"
              min={0}
              max={48}
              value={config.spacing}
              onChange={(event) => updateConfig('spacing', Number(event.target.value))}
            />
            <span>{config.spacing.toFixed(0)}</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Пункты меню</legend>
          {selectedItem ? (
            <div className="menu-item-editor">
              <label>
                Заголовок
                <input
                  type="text"
                  value={selectedItem.label}
                  onChange={(event) => updateItem(selectedItem.id, { label: event.target.value })}
                />
              </label>
              <label>
                Цвет
                <input
                  type="color"
                  value={selectedItem.color ?? '#ffffff'}
                  onChange={(event) => updateItem(selectedItem.id, { color: event.target.value })}
                />
              </label>
              <label>
                Команда или URL
                <textarea
                  value={selectedItem.command ?? ''}
                  onChange={(event) => updateItem(selectedItem.id, { command: event.target.value || null })}
                  placeholder="Например, C:\\Program Files\\App\\app.exe или https://example.com"
                />
              </label>
              <button type="button" className="secondary" onClick={() => handleRemoveItem(selectedItem.id)}>
                Удалить пункт
              </button>
            </div>
          ) : (
            <div className="empty-state" style={{ marginBottom: '12px' }}>
              <span>Выберите пункт на меню, чтобы настроить его параметры.</span>
            </div>
          )}

          <div className="menu-item-row">
            <span>Всего: {config.items.length}</span>
            <button type="button" onClick={handleAddItem}>
              Добавить пункт
            </button>
          </div>
        </fieldset>

        <div>
          <label className="shortcut-field">
            Горячая клавиша
            <input
              type="text"
              value={config.shortcut}
              onChange={(event) => updateConfig('shortcut', event.target.value)}
              placeholder="Например, Alt+Q"
            />
          </label>
          <fieldset className="activation-mode">
            <legend>Режим вызова</legend>
            <label className="radio-inline">
              <input
                type="radio"
                name="activation-mode"
                value="toggle"
                checked={config.activationMode === 'toggle'}
                onChange={() => updateConfig('activationMode', 'toggle')}
              />
              <span>Один клик (вкл/выкл)</span>
            </label>
            <label className="radio-inline">
              <input
                type="radio"
                name="activation-mode"
                value="hold"
                checked={config.activationMode === 'hold'}
                onChange={() => updateConfig('activationMode', 'hold')}
              />
              <span>Удержание (активно пока нажато)</span>
            </label>
          </fieldset>
          <p className="hint-text">Горячая клавиша: Alt+Q — показать/скрыть меню из любой программы</p>
          <button type="button" disabled={!isDirty || saving} onClick={handleSave}>
            {saving ? 'Сохранение...' : 'Сохранить макет'}
          </button>
          <button type="button" className="secondary" onClick={handleReset}>
            Сбросить
          </button>
          {statusMessage ? <p style={{ marginTop: '8px' }}>{statusMessage}</p> : null}
        </div>
      </aside>
    </main>
  );
};

export default App;
