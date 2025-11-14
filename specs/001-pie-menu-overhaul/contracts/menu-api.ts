// Pie Menu Rendering API Contracts
// Interfaces for menu display, interaction, and state management

export interface MenuRenderRequest {
  profileId: string;
  menuId: string;
  position?: { x: number; y: number }; // Optional cursor position
  context?: RenderContext; // App/window context
}

export interface MenuRenderResponse {
  success: boolean;
  data?: {
    menu: PieMenu;
    renderedHtml: string; // Pre-rendered DOM for overlay
    hotspots: Hotspot[]; // Click coordinates mapping
    animations: AnimationConfig;
  };
  error?: string;
}

export interface MenuInteractionRequest {
  menuId: string;
  action: InteractionType;
  sliceIndex?: number; // For slice-specific actions
  coordinates?: { x: number; y: number }; // Mouse position
}

export interface MenuInteractionResponse {
  success: boolean;
  data?: {
    actionExecuted?: ActionResult;
    newMenuId?: string; // For submenu navigation
    visualUpdate?: VisualUpdate; // DOM changes
  };
  error?: string;
}

export interface MenuHideRequest {
  menuId: string;
  immediate?: boolean; // Skip animations
}

export interface MenuStyleUpdateRequest {
  menuId: string;
  style: MenuStyle;
  animationEnabled?: boolean;
}

// State management queries
export interface MenuStateRequest {
  menuId?: string; // Specific menu, or all if omitted
}

export interface MenuStateResponse {
  success: boolean;
  data?: {
    states: MenuState[];
    activeMenuId?: string;
  };
  error?: string;
}

// Tauri commands
export const MENU_COMMANDS = {
  render: 'menu_render',
  interact: 'menu_interact',
  hide: 'menu_hide',
  style_update: 'menu_style_update',
  get_state: 'menu_get_state',
  preview: 'menu_preview', // For editor preview
} as const;

// Error codes
export const MENU_ERRORS = {
  NOT_FOUND: 'MENU_NOT_FOUND',
  RENDER_FAILED: 'RENDER_FAILED',
  INVALID_POSITION: 'INVALID_POSITION',
  ANIMATION_FAILED: 'ANIMATION_FAILED',
} as const;

// Supporting types
export enum InteractionType {
  SliceSelect = 'slice_select',
  SliceHover = 'slice_hover',
  MenuOpen = 'menu_open',
  MenuClose = 'menu_close',
  Cancel = 'cancel',
}

export interface Hotspot {
  sliceIndex: number;
  x: number;
  y: number;
  radius: number; // Hit area size
}

export interface AnimationConfig {
  enabled: boolean;
  duration: number; // ms
  easing: string; // CSS easing
  scale: number;
}

export interface ActionResult {
  actionId: string;
  status: 'queued' | 'executing' | 'completed' | 'failed';
  message?: string;
}

export interface VisualUpdate {
  cssChanges: string[]; // CSS class updates
  animationTriggers: string[]; // Animation class names
}

export interface RenderContext {
  appName?: string;
  windowTitle?: string;
  processId?: number;
}

export interface MenuState {
  id: string;
  status: 'hidden' | 'showing' | 'visible' | 'hiding';
  position: { x: number; y: number };
  lastInteraction?: Date;
}

interface PieMenu {
  id: string;
  name: string;
  slices: Slice[];
  style: MenuStyle;
  animationEnabled: boolean;
  scale: number;
  createdAt: string;
}

interface Slice {
  id: string;
  label: string;
  tooltip?: string;
  icon?: IconReference;
  action: Action;
  hotkey?: HotkeyBinding;
  position: number;
}

interface Action {
  id: string;
  name: string;
  type: string;
  config: unknown;
  examples: string[];
  tags: string[];
  createdAt: string;
}

interface MenuStyle {
  theme: string;
  customColors?: object;
}

interface IconReference {
  type: 'builtin' | 'custom';
  name: string;
  size?: number;
}

interface HotkeyBinding {
  key: string;
  modifiers: string[];
}
