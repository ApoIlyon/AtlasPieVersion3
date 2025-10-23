import { Fragment, useCallback, useMemo, useState } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import {
  type ActionDefinition,
  type ActionValidationResult,
  type MacroStep,
  type MacroStepKind,
  createEmptyActionDefinition,
  createStep,
  reorderSteps,
} from '../../types/actions';

interface ActionBuilderProps {
  value: ActionDefinition | null;
  disabled?: boolean;
  onChange: (action: ActionDefinition | null) => void;
  onValidate?: (result: ActionValidationResult) => void;
}

interface StepWarnings {
  id: string;
  messages: string[];
}

const STEP_KIND_OPTIONS: { label: string; value: MacroStepKind; description: string }[] = [
  { label: 'Launch', value: 'launch', description: 'Start an application or run a shell command.' },
  { label: 'Send Keys', value: 'keys', description: 'Simulate keystrokes or hotkeys.' },
  { label: 'Delay', value: 'delay', description: 'Pause for a specified amount of time.' },
  { label: 'Run Script', value: 'script', description: 'Execute an inline script snippet.' },
];

function StepRow({
  step,
  index,
  isActive,
  onSelect,
}: {
  step: MacroStep;
  index: number;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'grid grid-cols-[40px,1fr,auto] items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition',
        isActive
          ? 'border-accent/60 bg-accent/10 text-white'
          : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:bg-black/30',
        isDragging && 'border-accent/80 bg-accent/20 shadow-lg',
      )}
    >
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs uppercase tracking-[0.2em] text-white/50 hover:border-white/20 hover:text-white/80"
        {...attributes}
        {...listeners}
      >
        ::
      </button>
      <button
        type="button"
        className="flex flex-col items-start gap-0.5 text-left"
        onClick={() => onSelect(step.id)}
      >
        <span className="text-xs uppercase tracking-[0.25em] text-white/40">Step {index + 1}</span>
        <span className="text-sm font-semibold text-white">{step.kind}</span>
        <span className="text-[11px] text-white/40">
          {step.kind === 'launch' && 'Launch application or command'}
          {step.kind === 'keys' && 'Send keyboard input'}
          {step.kind === 'delay' && 'Pause execution'}
          {step.kind === 'script' && 'Run inline script'}
        </span>
      </button>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/50">
        {step.note?.length ? 'Note' : 'No note'}
      </span>
    </div>
  );
}

function LaunchFields({
  step,
  onChange,
}: {
  step: MacroStep & { kind: 'launch' };
  onChange: (patch: Partial<MacroStep & { kind: 'launch' }>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Application path or command</label>
        <input
          type="text"
          className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          placeholder="calc.exe"
          value={step.appPath}
          onChange={(event) => onChange({ appPath: event.target.value })}
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Arguments (optional)</label>
        <textarea
          className="mt-1 h-20 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          placeholder="--flag"
          value={step.arguments ?? ''}
          onChange={(event) => onChange({ arguments: event.target.value.length ? event.target.value : null })}
        />
      </div>
    </div>
  );
}

function KeysFields({
  step,
  onChange,
}: {
  step: MacroStep & { kind: 'keys' };
  onChange: (patch: Partial<MacroStep & { kind: 'keys' }>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Keys sequence</label>
        <input
          type="text"
          className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          placeholder="Ctrl+Shift+P"
          value={step.keys}
          onChange={(event) => onChange({ keys: event.target.value })}
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Repeat</label>
        <input
          type="number"
          min={1}
          max={10}
          className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={step.repeat ?? 1}
          onChange={(event) => onChange({ repeat: Number.parseInt(event.target.value, 10) || 1 })}
        />
      </div>
    </div>
  );
}

function DelayFields({
  step,
  onChange,
}: {
  step: MacroStep & { kind: 'delay' };
  onChange: (patch: Partial<MacroStep & { kind: 'delay' }>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Duration (ms)</label>
        <input
          type="number"
          min={10}
          max={5000}
          step={10}
          className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={step.durationMs}
          onChange={(event) => onChange({ durationMs: Number.parseInt(event.target.value, 10) || 0 })}
        />
      </div>
    </div>
  );
}

function ScriptFields({
  step,
  onChange,
}: {
  step: MacroStep & { kind: 'script' };
  onChange: (patch: Partial<MacroStep & { kind: 'script' }>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Language</label>
        <select
          className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={step.language}
          onChange={(event) => onChange({ language: event.target.value as 'powershell' | 'bash' | 'python' })}
        >
          <option value="powershell">PowerShell</option>
          <option value="bash">Bash</option>
          <option value="python">Python</option>
        </select>
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Script</label>
        <textarea
          className="mt-1 h-32 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          placeholder="Write script here"
          value={step.script}
          onChange={(event) => onChange({ script: event.target.value })}
        />
      </div>
    </div>
  );
}

function StepDetails({
  step,
  warnings,
  onChange,
  onDuplicate,
  onDelete,
}: {
  step: MacroStep;
  warnings: string[];
  onChange: (patch: Partial<MacroStep>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Selected Step</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{step.kind}</h3>
        </div>
        <div className="flex gap-2 text-xs uppercase tracking-[0.3em] text-white/60">
          <button
            type="button"
            className="rounded-full border border-white/10 px-3 py-1 transition hover:border-white/20 hover:text-white"
            onClick={onDuplicate}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="rounded-full border border-red-500/40 px-3 py-1 text-red-300 transition hover:border-red-500/60 hover:text-red-200"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-white/40">Notes (optional)</label>
        <textarea
          className="mt-1 h-20 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          placeholder="Describe context or usage"
          value={step.note ?? ''}
          onChange={(event) => onChange({ note: event.target.value.length ? event.target.value : null })}
        />
      </div>

      {step.kind === 'launch' && (
        <LaunchFields step={step} onChange={(patch) => onChange(patch)} />
      )}
      {step.kind === 'keys' && (
        <KeysFields step={step} onChange={(patch) => onChange(patch)} />
      )}
      {step.kind === 'delay' && (
        <DelayFields step={step} onChange={(patch) => onChange(patch)} />
      )}
      {step.kind === 'script' && (
        <ScriptFields step={step} onChange={(patch) => onChange(patch)} />
      )}

      {warnings.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Warnings</p>
          <ul className="space-y-1 text-xs text-amber-100">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function validateMacro(action: ActionDefinition): ActionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!action.name.trim().length) {
    errors.push('Action name is required.');
  }

  if (action.steps.length === 0) {
    errors.push('Add at least one step to run this action.');
  }

  if (action.steps.length > 20) {
    errors.push('Macro actions support up to 20 steps.');
  }

  action.steps.forEach((step, index) => {
    if (step.kind === 'launch') {
      if (!step.appPath.trim().length) {
        errors.push(`Step ${index + 1}: Specify application path or command to launch.`);
      }
    }
    if (step.kind === 'keys') {
      if (!step.keys.trim().length) {
        errors.push(`Step ${index + 1}: Enter a key sequence to send.`);
      }
      const repeat = step.repeat ?? 1;
      if (repeat < 1 || repeat > 10) {
        warnings.push(`Step ${index + 1}: Repeat count ${repeat} is out of recommended range (1-10).`);
      }
    }
    if (step.kind === 'delay') {
      if (step.durationMs < 10) {
        errors.push(`Step ${index + 1}: Delay must be at least 10 ms.`);
      } else if (step.durationMs > 5000) {
        warnings.push(`Step ${index + 1}: Delay over 5000 ms may feel unresponsive.`);
      }
    }
    if (step.kind === 'script') {
      if (!step.script.trim().length) {
        errors.push(`Step ${index + 1}: Provide script contents.`);
      }
      if (step.script.length > 4000) {
        warnings.push(`Step ${index + 1}: Large script may degrade performance.`);
      }
    }
  });

  if (action.timeoutMs < 500) {
    warnings.push('Timeout below 500 ms may interrupt longer scripts.');
  }

  if (action.timeoutMs > 10000) {
    warnings.push('Timeout above 10s may block input too long.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function ActionBuilder({ value, disabled = false, onChange, onValidate }: ActionBuilderProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const action = useMemo(() => value ?? createEmptyActionDefinition(), [value]);

  const selectedStep = useMemo(() => action.steps.find((step) => step.id === selectedStepId) ?? action.steps[0] ?? null, [action.steps, selectedStepId]);

  const warningsByStep = useMemo(() => {
    const result = validateMacro(action);
    const buckets = new Map<string, string[]>();
    result.warnings.forEach((warning) => {
      const match = warning.match(/Step (\d+)/);
      if (match) {
        const index = Number.parseInt(match[1] ?? '0', 10) - 1;
        const step = action.steps[index];
        if (step) {
          const bucket = buckets.get(step.id) ?? [];
          bucket.push(warning.replace(/^Step \d+:\s*/, ''));
          buckets.set(step.id, bucket);
        }
      }
    });
    return action.steps.map<StepWarnings>((step) => ({ id: step.id, messages: buckets.get(step.id) ?? [] }));
  }, [action]);

  const handleChange = useCallback(
    (next: ActionDefinition) => {
      const normalized = {
        ...next,
        steps: reorderSteps(next.steps),
      } satisfies ActionDefinition;
      onChange(normalized);
      const validation = validateMacro(normalized);
      onValidate?.(validation);
    },
    [onChange, onValidate],
  );

  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleChange({
        ...action,
        name: event.target.value,
      });
    },
    [action, handleChange],
  );

  const handleDescriptionChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleChange({
        ...action,
        description: event.target.value.length ? event.target.value : null,
      });
    },
    [action, handleChange],
  );

  const handleTimeoutChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextTimeout = Number.parseInt(event.target.value, 10);
      handleChange({
        ...action,
        timeoutMs: Number.isNaN(nextTimeout) ? action.timeoutMs : nextTimeout,
      });
    },
    [action, handleChange],
  );

  const handleAddStep = useCallback(
    (kind: MacroStepKind) => {
      if (disabled) {
        return;
      }
      const nextStep = createStep(kind, action.steps.length);
      handleChange({
        ...action,
        steps: [...action.steps, nextStep],
      });
      setSelectedStepId(nextStep.id);
    },
    [action, disabled, handleChange],
  );

  const handleDuplicateStep = useCallback(() => {
    if (!selectedStep || disabled) {
      return;
    }
    const clone: MacroStep = {
      ...selectedStep,
      id: nanoid(),
      order: action.steps.length,
    };
    handleChange({
      ...action,
      steps: [...action.steps, clone],
    });
    setSelectedStepId(clone.id);
  }, [action, disabled, handleChange, selectedStep]);

  const handleDeleteStep = useCallback(() => {
    if (!selectedStep || disabled) {
      return;
    }
    const filtered = action.steps.filter((step) => step.id !== selectedStep.id);
    handleChange({
      ...action,
      steps: filtered,
    });
    setSelectedStepId(filtered[0]?.id ?? null);
  }, [action, disabled, handleChange, selectedStep]);

  const handleStepPatch = useCallback(
    (id: string, patch: Partial<MacroStep>) => {
      handleChange({
        ...action,
        steps: action.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
      });
    },
    [action, handleChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const oldIndex = action.steps.findIndex((step) => step.id === active.id);
      const newIndex = action.steps.findIndex((step) => step.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return;
      }
      const reordered = arrayMove(action.steps, oldIndex, newIndex).map((step, index) => ({
        ...step,
        order: index,
      }));
      handleChange({
        ...action,
        steps: reordered,
      });
      setSelectedStepId(reordered[newIndex]?.id ?? null);
    },
    [action, handleChange],
  );

  const handleClear = useCallback(() => {
    handleChange(createEmptyActionDefinition(action.id, action.name));
    setSelectedStepId(null);
  }, [action.id, action.name, handleChange]);

  const validationResult = useMemo(() => validateMacro(action), [action]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px),1fr]">
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-white/40">Action Name</label>
              <input
                type="text"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Launch Calculator"
                value={action.name}
                onChange={handleNameChange}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-white/40">Description</label>
              <textarea
                className="mt-1 h-20 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Optional details for this action"
                value={action.description ?? ''}
                onChange={handleDescriptionChange}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-white/40">Timeout (ms)</label>
              <input
                type="number"
                min={500}
                max={15000}
                step={100}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={action.timeoutMs}
                onChange={handleTimeoutChange}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Steps</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-2xl border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.3em] text-white/60 transition hover:border-white/20 hover:text-white/80"
                onClick={handleClear}
                disabled={disabled}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={action.steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
                {action.steps.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-white/60">
                    No steps yet. Add a step below to get started.
                  </div>
                )}
                {action.steps.map((step, index) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={index}
                    isActive={selectedStep?.id === step.id}
                    onSelect={setSelectedStepId}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {STEP_KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-white/70 transition hover:border-white/20 hover:bg-black/30"
                onClick={() => handleAddStep(option.value)}
                disabled={disabled}
              >
                <span className="block text-xs uppercase tracking-[0.3em] text-white/40">{option.label}</span>
                <span className="mt-1 block text-sm text-white/70">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold text-white">Validation</h3>
          <div className="mt-3 space-y-2 text-xs">
            <p className={clsx('rounded-2xl border px-3 py-2', validationResult.isValid ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-red-400/40 bg-red-400/10 text-red-100')}>
              {validationResult.isValid ? 'Macro passes validation.' : 'Resolve validation errors before saving.'}
            </p>
            {validationResult.errors.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-red-400/40 bg-red-400/10 p-3 text-red-100">
                <p className="text-[11px] uppercase tracking-[0.3em]">Errors</p>
                <ul className="space-y-1">
                  {validationResult.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            {validationResult.warnings.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100">
                <p className="text-[11px] uppercase tracking-[0.3em]">Warnings</p>
                <ul className="space-y-1">
                  {validationResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onValidate?.(validationResult)}
            disabled={disabled}
          >
            Validate Macro
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {selectedStep ? (
          <StepDetails
            step={selectedStep}
            warnings={warningsByStep.find((bucket) => bucket.id === selectedStep.id)?.messages ?? []}
            onChange={(patch) => handleStepPatch(selectedStep.id, patch)}
            onDuplicate={handleDuplicateStep}
            onDelete={handleDeleteStep}
          />
        ) : (
          <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-white/60">
            Select a step to edit its parameters.
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">How validation works</p>
          <ul className="mt-2 space-y-2">
            <li>• Macros require 1–20 steps.</li>
            <li>• Launch steps need command or application path.</li>
            <li>• Delay steps allow 10–5000 ms (warnings outside 500–2000 ms).</li>
            <li>• Script steps should include secure code; large scripts may trigger warnings.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
