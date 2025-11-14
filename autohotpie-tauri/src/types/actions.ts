import { nanoid } from 'nanoid/non-secure';

export type ActionKind = 'launch' | 'macro' | 'sequence' | 'system' | 'clipboard' | 'window' | 'media';
export type MacroStepKind = 'launch' | 'keys' | 'delay' | 'script' | 'clipboard' | 'window' | 'media' | 'condition' | 'loop';

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

export interface ClipboardStep extends MacroStepBase {
  kind: 'clipboard';
  operation: 'copy' | 'paste' | 'clear';
  content?: string;
}

export interface WindowStep extends MacroStepBase {
  kind: 'window';
  operation: 'minimize' | 'maximize' | 'close' | 'focus';
  windowTitle?: string;
}

export interface MediaStep extends MacroStepBase {
  kind: 'media';
  operation: 'volume_up' | 'volume_down' | 'mute_toggle' | 'play_pause' | 'next_track' | 'prev_track';
  value?: number;
}

export interface ConditionStep extends MacroStepBase {
  kind: 'condition';
  condition: string;
  thenSteps: MacroStep[];
  elseSteps: MacroStep[];
}

export interface LoopStep extends MacroStepBase {
  kind: 'loop';
  count: number;
  steps: MacroStep[];
}

export type MacroStep = LaunchStep | KeysStep | DelayStep | ScriptStep | ClipboardStep | WindowStep | MediaStep | ConditionStep | LoopStep;

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



export function reorderSteps(steps: MacroStep[]): MacroStep[] {
  return steps
    .map((step, index) => ({ ...step, order: index }))
    .sort((a, b) => a.order - b.order);
}

export function validateActionDefinition(action: ActionDefinition): ActionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!action.name || action.name.trim().length === 0) {
    errors.push('Action name is required');
  }

  if (action.name && action.name.length > 100) {
    warnings.push('Action name is very long (max 100 characters)');
  }

  if (action.timeoutMs < 100) {
    warnings.push('Timeout is very short (less than 100ms)');
  }

  if (action.timeoutMs > 60000) {
    warnings.push('Timeout is very long (more than 60 seconds)');
  }

  if (action.steps.length === 0) {
    warnings.push('Action has no steps');
  }

  // Validate each step
  action.steps.forEach((step, index) => {
    const stepErrors = validateStep(step);
    errors.push(...stepErrors.map(err => `Step ${index + 1}: ${err}`));
  });

  // Check for potential infinite loops
  const hasLoop = action.steps.some(step => step.kind === 'loop' && step.count > 1000);
  if (hasLoop) {
    warnings.push('Action contains loops with high iteration count');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateStep(step: MacroStep): string[] {
  const errors: string[] = [];

  switch (step.kind) {
    case 'launch':
      if (!step.appPath || step.appPath.trim().length === 0) {
        errors.push('Application path is required');
      }
      break;

    case 'keys':
      if (!step.keys || step.keys.trim().length === 0) {
        errors.push('Keys are required');
      }
      if (step.repeat && step.repeat < 1) {
        errors.push('Repeat count must be at least 1');
      }
      break;

    case 'delay':
      if (step.durationMs < 0) {
        errors.push('Delay duration must be non-negative');
      }
      if (step.durationMs > 30000) {
        errors.push('Delay duration is very long (max 30 seconds)');
      }
      break;

    case 'script':
      if (!step.script || step.script.trim().length === 0) {
        errors.push('Script content is required');
      }
      if (!step.language || !['powershell', 'bash', 'python'].includes(step.language)) {
        errors.push('Invalid script language');
      }
      break;

    case 'clipboard':
      if (step.operation === 'copy' && (!step.content || step.content.trim().length === 0)) {
        errors.push('Content is required for copy operation');
      }
      if (!['copy', 'paste', 'clear'].includes(step.operation)) {
        errors.push('Invalid clipboard operation');
      }
      break;

    case 'window':
      if (!['minimize', 'maximize', 'close', 'focus'].includes(step.operation)) {
        errors.push('Invalid window operation');
      }
      break;

    case 'media':
      if (!['volume_up', 'volume_down', 'mute_toggle', 'play_pause', 'next_track', 'prev_track'].includes(step.operation)) {
        errors.push('Invalid media operation');
      }
      if (step.value !== undefined && (step.value < 0 || step.value > 100)) {
        errors.push('Media value must be between 0 and 100');
      }
      break;

    case 'condition':
      if (!step.condition || step.condition.trim().length === 0) {
        errors.push('Condition expression is required');
      }
      if (step.thenSteps.length === 0 && step.elseSteps.length === 0) {
        errors.push('Condition must have at least one then or else step');
      }
      break;

    case 'loop':
      if (step.count < 1) {
        errors.push('Loop count must be at least 1');
      }
      if (step.steps.length === 0) {
        errors.push('Loop must contain at least one step');
      }
      break;

    default:
      errors.push(`Unknown step kind: ${(step as any).kind}`);
  }

  return errors;
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
    case 'clipboard':
      return {
        id: nanoid(),
        kind,
        order,
        operation: 'copy',
        content: '',
        note: null,
      };
    case 'window':
      return {
        id: nanoid(),
        kind,
        order,
        operation: 'minimize',
        windowTitle: null,
        note: null,
      };
    case 'media':
      return {
        id: nanoid(),
        kind,
        order,
        operation: 'volume_up',
        value: 10,
        note: null,
      };
    case 'condition':
      return {
        id: nanoid(),
        kind,
        order,
        condition: '',
        thenSteps: [],
        elseSteps: [],
        note: null,
      };
    case 'loop':
      return {
        id: nanoid(),
        kind,
        order,
        count: 1,
        steps: [],
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
