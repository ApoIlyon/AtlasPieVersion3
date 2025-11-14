// Action Execution API Contracts
// Pipeline for executing actions from slices

export interface ActionExecuteRequest {
  actionId: string;
  context?: ExecutionContext; // Window/app context for conditional actions
  parameters?: Record<string, unknown>; // Runtime parameters
}

export interface ActionExecuteResponse {
  success: boolean;
  data?: {
    executionId: string; // Trackable ID for async actions
    status: ExecutionStatus;
    result?: ActionResult;
    logs?: string[]; // Execution log entries
  };
  error?: string;
}

export interface ActionCancelRequest {
  executionId: string;
}

export interface ActionStatusRequest {
  executionId: string;
}

export interface ActionStatusResponse {
  success: boolean;
  data?: {
    executionId: string;
    status: ExecutionStatus;
    progress?: number; // 0-100 for long-running actions
    message?: string;
    result?: ActionResult;
  };
  error?: string;
}

export interface ActionValidateRequest {
  actionConfig: ActionConfig;
  type: ActionType;
}

export interface ActionValidateResponse {
  success: boolean;
  data?: {
    isValid: boolean;
    warnings?: string[];
    suggestions?: string[];
  };
  error?: string;
}

// Command names
export const ACTION_COMMANDS = {
  execute: 'action_execute',
  cancel: 'action_cancel',
  status: 'action_status',
  validate: 'action_validate',
  list: 'action_list', // Get available actions
} as const;

// Error codes
export const ACTION_ERRORS = {
  NOT_FOUND: 'ACTION_NOT_FOUND',
  INVALID_CONFIG: 'INVALID_ACTION_CONFIG',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TIMEOUT: 'EXECUTION_TIMEOUT',
} as const;

// Types
export enum ExecutionStatus {
  Queued = 'queued',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface ExecutionContext {
  appName?: string;
  windowTitle?: string;
  processId?: number;
  workingDirectory?: string;
}

export interface ActionResult {
  success: boolean;
  data?: unknown; // Action-specific result (output, exit code, etc.)
  duration?: number; // Execution time in ms
  errorDetails?: string;
}

export enum ActionType {
  Shell = 'shell',
  Keyboard = 'keyboard',
  Application = 'application',
  Custom = 'custom',
}

// Configuration for each action type
export type ActionConfig =
  | ShellActionConfig
  | KeyboardActionConfig
  | ApplicationActionConfig
  | CustomActionConfig;

export interface ShellActionConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number; // ms
  shell?: boolean; // Use shell interpretation
}

export interface KeyboardActionConfig {
  sequence: KeyboardEvent[]; // Sequence of key presses
  delay?: number; // Delay between keys
  releaseDelay?: number; // Delay before releasing mods
}

export interface ApplicationActionConfig {
  path: string;
  args?: string[];
  workingDir?: string;
  waitForExit?: boolean;
}

export interface CustomActionConfig {
  functionName: string; // Named function in registry
  parameters: Record<string, unknown>;
  timeout?: number;
}

export interface KeyboardEvent {
  key: string;
  modifiers?: string[]; // ctrl, alt, shift, meta
  action: 'press' | 'release' | 'tap';
}
