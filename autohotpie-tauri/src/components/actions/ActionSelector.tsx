import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ActionType = 
  | 'launch-app'
  | 'open-url'
  | 'run-command'
  | 'keyboard-shortcut'
  | 'custom-command'
  | 'submenu';

export interface ActionConfig {
  type: ActionType;
  data: {
    path?: string;
    url?: string;
    command?: string;
    args?: string[];
    shortcut?: string;
    commandId?: string;
    menuId?: string;
  };
}

interface ActionSelectorProps {
  currentAction: ActionConfig | null;
  onActionChange: (action: ActionConfig | null) => void;
  onClose?: () => void;
}

const ACTION_TYPES = [
  {
    id: 'launch-app' as ActionType,
    name: 'Launch Application',
    icon: '🚀',
    description: 'Open an application or file',
  },
  {
    id: 'open-url' as ActionType,
    name: 'Open URL',
    icon: '🌐',
    description: 'Open a website in browser',
  },
  {
    id: 'run-command' as ActionType,
    name: 'Run Command',
    icon: '⌨️',
    description: 'Execute a system command',
  },
  {
    id: 'keyboard-shortcut' as ActionType,
    name: 'Keyboard Shortcut',
    icon: '⌨️',
    description: 'Send keyboard combination',
  },
  {
    id: 'custom-command' as ActionType,
    name: 'Custom Command',
    icon: '⚡',
    description: 'Run a custom macro',
  },
  {
    id: 'submenu' as ActionType,
    name: 'Submenu',
    icon: '📂',
    description: 'Open nested menu',
  },
];

export function ActionSelector({ currentAction, onActionChange, onClose }: ActionSelectorProps) {
  const [selectedType, setSelectedType] = useState<ActionType | null>(
    currentAction?.type || null
  );
  const [config, setConfig] = useState(currentAction?.data || {});

  const handleSave = () => {
    if (selectedType) {
      onActionChange({
        type: selectedType,
        data: config,
      });
    }
    onClose?.();
  };

  const handleClear = () => {
    onActionChange(null);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900 to-black p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Select Action</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Action Type Selection */}
        {!selectedType && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ACTION_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className="group rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-accent/60 hover:bg-accent/10"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-2xl">{type.icon}</span>
                  <h3 className="font-semibold text-white">{type.name}</h3>
                </div>
                <p className="text-xs text-white/60">{type.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Action Configuration */}
        <AnimatePresence mode="wait">
          {selectedType && (
            <motion.div
              key={selectedType}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl">
                    {ACTION_TYPES.find((t) => t.id === selectedType)?.icon}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">
                      {ACTION_TYPES.find((t) => t.id === selectedType)?.name}
                    </h3>
                    <p className="text-xs text-white/60">
                      {ACTION_TYPES.find((t) => t.id === selectedType)?.description}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedType(null);
                      setConfig({});
                    }}
                    className="ml-auto rounded-lg px-3 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    Change
                  </button>
                </div>

                {/* Launch App Config */}
                {selectedType === 'launch-app' && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                        Application Path
                      </label>
                      <input
                        type="text"
                        placeholder="C:\Program Files\App\app.exe"
                        value={config.path || ''}
                        onChange={(e) => setConfig({ ...config, path: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                        Arguments (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="--flag value"
                        value={config.args?.join(' ') || ''}
                        onChange={(e) =>
                          setConfig({ ...config, args: e.target.value.split(' ') })
                        }
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    </div>
                  </div>
                )}

                {/* Open URL Config */}
                {selectedType === 'open-url' && (
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                      URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={config.url || ''}
                      onChange={(e) => setConfig({ ...config, url: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                )}

                {/* Run Command Config */}
                {selectedType === 'run-command' && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                        Command
                      </label>
                      <input
                        type="text"
                        placeholder="powershell"
                        value={config.command || ''}
                        onChange={(e) => setConfig({ ...config, command: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                        Arguments
                      </label>
                      <input
                        type="text"
                        placeholder="-Command 'Get-Process'"
                        value={config.args?.join(' ') || ''}
                        onChange={(e) =>
                          setConfig({ ...config, args: e.target.value.split(' ') })
                        }
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    </div>
                  </div>
                )}

                {/* Keyboard Shortcut Config */}
                {selectedType === 'keyboard-shortcut' && (
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                      Shortcut
                    </label>
                    <input
                      type="text"
                      placeholder="Ctrl+C, Alt+Tab, Win+D"
                      value={config.shortcut || ''}
                      onChange={(e) => setConfig({ ...config, shortcut: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                    <p className="mt-2 text-xs text-white/40">
                      Examples: Ctrl+C, Alt+Tab, Win+D, Ctrl+Shift+Esc
                    </p>
                  </div>
                )}

                {/* Custom Command Config */}
                {selectedType === 'custom-command' && (
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                      Custom Command
                    </label>
                    <select
                      value={config.commandId || ''}
                      onChange={(e) => setConfig({ ...config, commandId: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      <option value="">Select a command...</option>
                      <option value="cmd-1">Example Command 1</option>
                      <option value="cmd-2">Example Command 2</option>
                    </select>
                    <p className="mt-2 text-xs text-white/40">
                      Create custom commands in the Commands section
                    </p>
                  </div>
                )}

                {/* Submenu Config */}
                {selectedType === 'submenu' && (
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
                      Submenu
                    </label>
                    <select
                      value={config.menuId || ''}
                      onChange={(e) => setConfig({ ...config, menuId: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      <option value="">Select a menu...</option>
                      <option value="menu-1">Submenu 1</option>
                      <option value="menu-2">Submenu 2</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-2xl bg-accent px-4 py-3 font-semibold text-black transition hover:bg-accent/90"
                >
                  Save Action
                </button>
                <button
                  onClick={handleClear}
                  className="rounded-2xl border border-white/15 px-4 py-3 text-sm text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  Clear
                </button>
                <button
                  onClick={onClose}
                  className="rounded-2xl border border-white/15 px-4 py-3 text-sm text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
