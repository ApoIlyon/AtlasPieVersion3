export type CommandValue = string | null | undefined;

export type ActivationMode = 'toggle' | 'hold';

export interface MenuItem {
  id: string;
  label: string;
  command?: CommandValue;
  color?: string | null;
}

export interface RadialConfig {
  radius: number;
  itemSize: number;
  spacing: number;
  items: MenuItem[];
  shortcut: string;
  activationMode: ActivationMode;
}

export const DEFAULT_CONFIG: RadialConfig = {
  radius: 140,
  itemSize: 56,
  spacing: 10,
  shortcut: 'Alt+Q',
  activationMode: 'toggle',
  items: [
    {
      id: 'item-1',
      label: 'Browser',
      command: 'https://www.rust-lang.org',
      color: '#8ecae6',
    },
    {
      id: 'item-2',
      label: 'Editor',
      command: null,
      color: '#ffb703',
    },
    {
      id: 'item-3',
      label: 'Terminal',
      command: null,
      color: '#fb8500',
    },
  ],
};

export interface BackendMenuItem {
  id: string;
  label: string;
  command?: CommandValue;
  color?: string | null;
}

export interface BackendRadialConfig {
  radius: number;
  item_size: number;
  spacing: number;
  items: BackendMenuItem[];
  shortcut?: string | null;
  activation_mode?: ActivationMode | null;
}

export interface HoldShortcutPayload {
  active: boolean;
  shortcut: string;
}

export const fromBackendConfig = (config: BackendRadialConfig): RadialConfig => ({
  radius: config.radius ?? DEFAULT_CONFIG.radius,
  itemSize: config.item_size ?? DEFAULT_CONFIG.itemSize,
  spacing: config.spacing ?? DEFAULT_CONFIG.spacing,
  shortcut: config.shortcut ?? DEFAULT_CONFIG.shortcut,
  activationMode: config.activation_mode ?? DEFAULT_CONFIG.activationMode,
  items: (config.items ?? []).map((item, index) => ({
    id: item.id || `item-${index + 1}`,
    label: item.label || `Элемент ${index + 1}`,
    command: item.command ?? null,
    color: item.color ?? null,
  })),
});

export const toBackendConfig = (config: RadialConfig): BackendRadialConfig => ({
  radius: config.radius,
  item_size: config.itemSize,
  spacing: config.spacing,
  items: config.items.map((item) => ({
    id: item.id,
    label: item.label,
    command: item.command ?? null,
    color: item.color ?? null,
  })),
  shortcut: config.shortcut,
  activation_mode: config.activationMode,
});
