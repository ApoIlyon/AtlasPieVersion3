import { nanoid } from 'nanoid/non-secure';

export type ActionKind = 'launch' | 'macro' | 'sequence' | 'system';
export type MacroStepKind = 'launch' | 'keys' | 'delay' | 'script';

export interface MacroStepBase {
  id: string;
  order: number;
  kind: MacroStepKind;
  note?: string | null;
}

export interface LaunchStep extends MacroStepBase {
  kind: 'launch';
  appPath: string;
  arguments?: string | null;
}

export interface KeysStep extends MacroStepBase {
  kind: 'keys';
  keys: string;
  repeat?: number;
}

export interface DelayStep extends MacroStepBase {
  kind: 'delay';
  durationMs: number;
}

export interface ScriptStep extends MacroStepBase {
  kind: 'script';
  language: 'powershell' | 'bash' | 'python';
  script: string;
}

export type MacroStep = LaunchStep | KeysStep | DelayStep | ScriptStep;

export interface ActionDefinition {
  id: string;
  name: string;
  description?: string | null;
  kind: ActionKind;
  steps: MacroStep[];
  timeoutMs: number;
  lastValidatedAt?: string | null;
}

export interface ActionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function cloneActionDefinition(action: ActionDefinition): ActionDefinition {
  return {
    ...action,
    steps: action.steps.map((step) => ({ ...step })),
  };
}

export function createEmptyActionDefinition(id?: string, name?: string): ActionDefinition {
  return {
    id: id ?? nanoid(),
    name: name?.trim().length ? name : 'Untitled Action',
    description: null,
    kind: 'macro',
    steps: [],
    timeoutMs: 3000,
    lastValidatedAt: null,
  };
}

export function createStep(kind: MacroStepKind, order: number): MacroStep {
  switch (kind) {
    case 'launch':
      return {
        id: nanoid(),
        kind,
        order,
        appPath: '',
        arguments: null,
        note: null,
      };
    case 'keys':
      return {
        id: nanoid(),
        kind,
        order,
        keys: '',
        repeat: 1,
        note: null,
      };
    case 'delay':
      return {
        id: nanoid(),
        kind,
        order,
        durationMs: 250,
        note: null,
      };
    case 'script':
      return {
        id: nanoid(),
        kind,
        order,
        language: 'powershell',
        script: '',
        note: null,
      };
    default:
      return {
        id: nanoid(),
        kind: 'delay',
        order,
        durationMs: 250,
        note: null,
      };
  }
}

export function reorderSteps(steps: MacroStep[]): MacroStep[] {
  return steps
    .map((step, index) => ({ ...step, order: index }))
    .sort((a, b) => a.order - b.order);
}
