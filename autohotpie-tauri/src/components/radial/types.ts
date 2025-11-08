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

export const DEFAULT_RADIAL_CONFIG: RadialConfig = {
  radius: 160,
  itemSize: 62,
  spacing: 14,
  shortcut: 'Alt+Q',
  activationMode: 'toggle',
  items: [
    { id: 'radial-browser', label: 'Browser', command: 'https://www.example.com', color: '#60a5fa' },
    { id: 'radial-mail', label: 'Mail', command: 'mailto:', color: '#f472b6' },
    { id: 'radial-editor', label: 'Editor', command: null, color: '#facc15' },
    { id: 'radial-terminal', label: 'Terminal', command: null, color: '#34d399' },
    { id: 'radial-media', label: 'Media', command: null, color: '#a855f7' },
    { id: 'radial-search', label: 'Search', command: null, color: '#fb7185' },
  ],
};
