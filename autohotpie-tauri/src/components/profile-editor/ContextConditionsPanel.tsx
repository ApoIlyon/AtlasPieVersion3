import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  type ActivationMatchMode,
  type ActivationRule,
  type ProfileRecord,
  useProfileStore,
} from '../../state/profileStore';

interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RuleDraft {
  id: string;
  mode: ActivationMatchMode;
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  negate: boolean;
  screenArea: ScreenArea | null;
}

interface RuleDecodeMeta {
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  screenArea: ScreenArea | null;
}

interface ContextConditionsPanelProps {
  profile: ProfileRecord;
}

const MODE_OPTIONS: Array<{
  value: ActivationMatchMode;
  label: string;
  hint: string;
}> = [
  { value: 'always', label: 'Always active', hint: 'Fallback rule that always matches.' },
  {
    value: 'process_name',
    label: 'Process name',
    hint: 'Matches executable names like notepad.exe or code.exe.',
  },
  {
    value: 'window_title',
    label: 'Window title',
    hint: 'Matches window captions and document titles.',
  },
  {
    value: 'window_class',
    label: 'Window class',
    hint: 'Advanced matching using OS window class names.',
  },
  {
    value: 'screen_area',
    label: 'Screen region',
    hint: 'Activates within a specific rectangle (x/y + width/height).',
  },
  {
    value: 'custom',
    label: 'Custom (backend)',
    hint: 'Reserved for backend-driven matching strategies.',
  },
];

function generateRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

function parseLegacyScreenArea(value: string | null | undefined): ScreenArea | null {
  if (!value) {
    return null;
  }
  const legacyPattern = /^(-?\d+)x(-?\d+):(\d+)x(\d+)$/;
  const match = legacyPattern.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    x: Number.parseInt(match[1], 10),
    y: Number.parseInt(match[2], 10),
    width: Number.parseInt(match[3], 10),
    height: Number.parseInt(match[4], 10),
  };
}

function decodeRuleValue(rule: ActivationRule): RuleDecodeMeta {
  const fallback: RuleDecodeMeta = {
    pattern: '',
    isRegex: false,
    caseSensitive: false,
    screenArea: rule.mode === 'screen_area' ? parseLegacyScreenArea(rule.value) : null,
  };

  const rawValue = rule.value ?? '';
  if (!rawValue) {
    return fallback;
  }

  if (rawValue.startsWith('json:')) {
    try {
      const parsed = JSON.parse(rawValue.slice(5)) as Partial<{
        pattern: unknown;
        isRegex: unknown;
        caseSensitive: unknown;
        screenArea: unknown;
      }>;
      return {
        pattern: typeof parsed.pattern === 'string' ? parsed.pattern : '',
        isRegex: Boolean(parsed.isRegex),
        caseSensitive: Boolean(parsed.caseSensitive),
        screenArea:
          parsed.screenArea && typeof parsed.screenArea === 'object'
            ? normalizeScreenArea(parsed.screenArea as Record<string, unknown>)
            : fallback.screenArea,
      };
    } catch (error) {
      console.warn('Failed to parse activation rule JSON payload', error);
      return fallback;
    }
  }

  if (rawValue.startsWith('regex:')) {
    return {
      pattern: rawValue.slice('regex:'.length).trim(),
      isRegex: true,
      caseSensitive: false,
      screenArea: fallback.screenArea,
    };
  }

  return {
    pattern: rawValue.trim(),
    isRegex: false,
    caseSensitive: false,
    screenArea: fallback.screenArea,
  };
}

function normalizeScreenArea(candidate: Record<string, unknown>): ScreenArea | null {
  const { x, y, width, height } = candidate;
  if (
    typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  ) {
    return { x, y, width, height };
  }
  return null;
}

function deserializeRules(rules: ActivationRule[]): RuleDraft[] {
  return rules.map((rule) => {
    const decoded = decodeRuleValue(rule);
    return {
      id: generateRuleId(),
      mode: rule.mode,
      pattern: decoded.pattern,
      isRegex: decoded.isRegex,
      caseSensitive: decoded.caseSensitive,
      negate: Boolean(rule.negate),
      screenArea: decoded.screenArea,
    };
  });
}

function encodeRuleValue(draft: RuleDraft): string | null {
  if (draft.mode === 'always') {
    return null;
  }

  if (draft.mode === 'screen_area') {
    const payload = {
      version: 1,
      screenArea: draft.screenArea,
      pattern: draft.pattern.trim(),
      isRegex: draft.isRegex,
      caseSensitive: draft.caseSensitive,
    };
    return `json:${JSON.stringify(payload)}`;
  }

  const trimmed = draft.pattern.trim();

  if (!draft.caseSensitive && !draft.negate && draft.isRegex && trimmed) {
    return `regex:${trimmed}`;
  }

  if (!draft.caseSensitive && !draft.negate && !draft.isRegex) {
    return trimmed || null;
  }

  const payload = {
    version: 1,
    pattern: trimmed,
    isRegex: draft.isRegex,
    caseSensitive: draft.caseSensitive,
  };
  return `json:${JSON.stringify(payload)}`;
}

function encodeRule(draft: RuleDraft): ActivationRule {
  const value = encodeRuleValue(draft);
  return {
    mode: draft.mode,
    value: value ?? undefined,
    negate: draft.negate ? true : null,
  };
}

function serializeDrafts(drafts: RuleDraft[]): string {
  return JSON.stringify(
    drafts.map((draft) => ({
      mode: draft.mode,
      value: encodeRuleValue(draft),
      negate: draft.negate,
    })),
  );
}

function validateDraft(draft: RuleDraft): string[] {
  const issues: string[] = [];
  if (draft.mode !== 'always' && draft.mode !== 'screen_area') {
    if (!draft.pattern.trim()) {
      issues.push('Pattern is required.');
    }
  }

  if (draft.mode === 'screen_area') {
    if (!draft.screenArea) {
      issues.push('Screen region must be specified.');
    } else {
      const { width, height } = draft.screenArea;
      if (width <= 0 || height <= 0) {
        issues.push('Screen region width and height must be greater than zero.');
      }
    }
  }

  if (draft.isRegex && draft.pattern.trim()) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(draft.pattern.trim());
    } catch (error) {
      issues.push('Regular expression is invalid.');
    }
  }

  return issues;
}

export function ContextConditionsPanel({ profile }: ContextConditionsPanelProps) {
  const { updateProfileActivationRules, validationErrors, clearValidationErrors } = useProfileStore(
    (state) => ({
      updateProfileActivationRules: state.updateProfileActivationRules,
      validationErrors: state.validationErrors,
      clearValidationErrors: state.clearValidationErrors,
    }),
  );

  const initialDrafts = useMemo(
    () => deserializeRules(profile.profile.activationRules ?? []),
    [profile.profile.activationRules, profile.profile.id],
  );

  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft[]>(initialDrafts);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(initialDrafts[0]?.id ?? null);
  const [messages, setMessages] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [modePickerValue, setModePickerValue] = useState<string>('');

  useEffect(() => {
    const drafts = deserializeRules(profile.profile.activationRules ?? []);
    setRuleDrafts(drafts);
    setActiveRuleId((current) => {
      if (current && drafts.some((draft) => draft.id === current)) {
        return current;
      }
      return drafts[0]?.id ?? null;
    });
    setModePickerValue('');
    setMessages([]);
  }, [profile.profile.activationRules, profile.profile.id]);

  const originalSignature = useMemo(() => {
    return JSON.stringify(
      (profile.profile.activationRules ?? []).map((rule) => ({
        mode: rule.mode,
        value: rule.value ?? null,
        negate: Boolean(rule.negate),
      })),
    );
  }, [profile.profile.activationRules, profile.profile.id]);

  const currentSignature = useMemo(() => serializeDrafts(ruleDrafts), [ruleDrafts]);
  const hasChanges = originalSignature !== currentSignature;

  const activeRule = useMemo(
    () => ruleDrafts.find((rule) => rule.id === activeRuleId) ?? null,
    [activeRuleId, ruleDrafts],
  );

  const validationIssues = useMemo(() => {
    if (!activeRule) {
      return [];
    }
    return validateDraft(activeRule);
  }, [activeRule]);

  const overallIssues = useMemo(() => ruleDrafts.flatMap((draft) => validateDraft(draft)), [ruleDrafts]);

  function upsertRule(update: (draft: RuleDraft) => RuleDraft) {
    setRuleDrafts((prev) => prev.map((draft) => (draft.id === activeRuleId ? update(draft) : draft)));
  }

  async function handleSave() {
    if (overallIssues.length > 0) {
      setMessages(['Resolve validation errors before saving.']);
      return;
    }
    setIsSaving(true);
    clearValidationErrors();
    setMessages([]);
    try {
      const saved = await updateProfileActivationRules(
        profile.profile.id,
        ruleDrafts.map((draft) => encodeRule(draft)),
      );
      if (saved) {
        setMessages(['Context rules saved successfully.']);
      }
    } catch (error: unknown) {
      console.error('Failed to save context rules', error);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddRule(mode: ActivationMatchMode) {
    const draft: RuleDraft = {
      id: generateRuleId(),
      mode,
      pattern: '',
      isRegex: false,
      caseSensitive: false,
      negate: false,
      screenArea: mode === 'screen_area'
        ? { x: 0, y: 0, width: 640, height: 480 }
        : null,
    };
    setRuleDrafts((prev) => [...prev, draft]);
    setActiveRuleId(draft.id);
    setModePickerValue('');
  }

  function handleDelete(ruleId: string) {
    setRuleDrafts((prev) => {
      const next = prev.filter((draft) => draft.id !== ruleId);
      setActiveRuleId((current) => {
        if (current === ruleId) {
          return next[0]?.id ?? null;
        }
        return current;
      });
      return next;
    });
  }

  function handleMove(ruleId: string, direction: 'up' | 'down') {
    setRuleDrafts((prev) => {
      const index = prev.findIndex((draft) => draft.id === ruleId);
      if (index === -1) {
        return prev;
      }
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }
      const clone = [...prev];
      const [removed] = clone.splice(index, 1);
      clone.splice(nextIndex, 0, removed);
      return clone;
    });
  }

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold text-white">Context conditions</h4>
          <p className="mt-1 text-sm text-white/60">
            Define where this profile is considered active. All rules must pass for activation unless the
            fallback rule is used.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 transition hover:border-white/20"
            value={modePickerValue}
            onChange={(event) => {
              const mode = event.target.value as ActivationMatchMode;
              if (!mode) {
                return;
              }
              handleAddRule(mode);
              setModePickerValue('');
            }}
          >
            <option value="" disabled>
              Add rule
            </option>
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-2xl border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/10"
            onClick={() => handleAddRule('process_name')}
          >
            Quick add
          </button>
        </div>
      </div>

      {ruleDrafts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 px-4 py-6 text-center text-sm text-white/60">
          No context rules configured. Add one to restrict activation to specific apps or regions.
        </div>
      )}

      {ruleDrafts.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[260px,1fr]">
          <div className="space-y-2">
            {ruleDrafts.map((draft, index) => {
              const option = MODE_OPTIONS.find((item) => item.value === draft.mode);
              const summary = draft.mode === 'screen_area'
                ? draft.screenArea
                  ? `${draft.screenArea.x},${draft.screenArea.y} ${draft.screenArea.width}×${draft.screenArea.height}`
                  : 'Region not set'
                : draft.pattern || 'No pattern';
              return (
                <div
                  key={draft.id}
                  className={clsx(
                    'rounded-2xl border px-3 py-3 transition',
                    draft.id === activeRuleId
                      ? 'border-accent/60 bg-accent/10 shadow-[0_0_15px_rgba(53,177,255,0.25)]'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setActiveRuleId(draft.id)}
                  >
                    <p className="text-sm font-semibold text-white">{option?.label ?? draft.mode}</p>
                    <p className="mt-1 text-xs text-white/60">{summary}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[0.6rem] uppercase tracking-[0.3em] text-white/40">
                      {draft.isRegex && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Regex</span>}
                      {draft.caseSensitive && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Case sensitive</span>
                      )}
                      {draft.negate && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Negated</span>
                      )}
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-white/50">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 hover:border-white/20"
                        onClick={() => handleMove(draft.id, 'up')}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 hover:border-white/20"
                        onClick={() => handleMove(draft.id, 'down')}
                        disabled={index === ruleDrafts.length - 1}
                      >
                        Down
                      </button>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-200 hover:border-red-500/40"
                      onClick={() => handleDelete(draft.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            {!activeRule && (
              <p className="text-sm text-white/60">Select a rule to edit its conditions.</p>
            )}
            {activeRule && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-white/40">Match mode</label>
                  <select
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 transition hover:border-white/20"
                    value={activeRule.mode}
                    onChange={(event) => {
                      const nextMode = event.target.value as ActivationMatchMode;
                      upsertRule((draft) => ({
                        ...draft,
                        mode: nextMode,
                        screenArea:
                          nextMode === 'screen_area'
                            ? draft.screenArea ?? { x: 0, y: 0, width: 640, height: 480 }
                            : null,
                      }));
                    }}
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-white/50">
                    {MODE_OPTIONS.find((option) => option.value === activeRule.mode)?.hint}
                  </p>
                </div>

                {activeRule.mode !== 'always' && activeRule.mode !== 'screen_area' && (
                  <div>
                    <label className="text-xs uppercase tracking-[0.3em] text-white/40">Pattern</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 focus:border-accent focus:ring-0"
                      value={activeRule.pattern}
                      placeholder="Example: code.exe"
                      onChange={(event) => {
                        const value = event.target.value;
                        upsertRule((draft) => ({ ...draft, pattern: value }));
                      }}
                    />
                  </div>
                )}

                {activeRule.mode === 'screen_area' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] text-white/40">X</label>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 focus:border-accent focus:ring-0"
                        value={activeRule.screenArea?.x ?? 0}
                        onChange={(event) => {
                          const x = Number.parseInt(event.target.value, 10) || 0;
                          upsertRule((draft) => ({
                            ...draft,
                            screenArea: draft.screenArea ? { ...draft.screenArea, x } : { x, y: 0, width: 640, height: 480 },
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] text-white/40">Y</label>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 focus:border-accent focus:ring-0"
                        value={activeRule.screenArea?.y ?? 0}
                        onChange={(event) => {
                          const y = Number.parseInt(event.target.value, 10) || 0;
                          upsertRule((draft) => ({
                            ...draft,
                            screenArea: draft.screenArea ? { ...draft.screenArea, y } : { x: 0, y, width: 640, height: 480 },
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] text-white/40">Width</label>
                      <input
                        type="number"
                        min={1}
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 focus:border-accent focus:ring-0"
                        value={activeRule.screenArea?.width ?? 640}
                        onChange={(event) => {
                          const width = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
                          upsertRule((draft) => ({
                            ...draft,
                            screenArea: draft.screenArea
                              ? { ...draft.screenArea, width }
                              : { x: 0, y: 0, width, height: 480 },
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] text-white/40">Height</label>
                      <input
                        type="number"
                        min={1}
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 focus:border-accent focus:ring-0"
                        value={activeRule.screenArea?.height ?? 480}
                        onChange={(event) => {
                          const height = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
                          upsertRule((draft) => ({
                            ...draft,
                            screenArea: draft.screenArea
                              ? { ...draft.screenArea, height }
                              : { x: 0, y: 0, width: 640, height },
                          }));
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm text-white/80">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeRule.isRegex}
                      onChange={(event) => {
                        const isRegex = event.target.checked;
                        upsertRule((draft) => ({ ...draft, isRegex }));
                      }}
                    />
                    Regex pattern
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeRule.caseSensitive}
                      onChange={(event) => {
                        const caseSensitive = event.target.checked;
                        upsertRule((draft) => ({ ...draft, caseSensitive }));
                      }}
                    />
                    Case sensitive
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeRule.negate}
                      onChange={(event) => {
                        const negate = event.target.checked;
                        upsertRule((draft) => ({ ...draft, negate }));
                      }}
                    />
                    Negate match
                  </label>
                </div>

                {validationIssues.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                    {validationIssues.map((issue, index) => (
                      <p key={`${issue}-${index}`}>{issue}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {(messages.length > 0 || validationErrors.length > 0) && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          {messages.map((message, index) => (
            <p key={`${message}-${index}`}>{message}</p>
          ))}
          {validationErrors.map((error, index) => (
            <p key={`${error}-${index}`} className="text-red-300">
              {error}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/50">
          {ruleDrafts.length} rule{ruleDrafts.length === 1 ? '' : 's'} configured. Order defines evaluation priority.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/25 hover:text-white/85"
            onClick={() => {
              setRuleDrafts(deserializeRules(profile.profile.activationRules ?? []));
              setMessages([]);
            }}
            disabled={!hasChanges || isSaving}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded-2xl bg-accent px-5 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void handleSave()}
            disabled={!hasChanges || isSaving || overallIssues.length > 0}
          >
            {isSaving ? 'Saving…' : 'Save rules'}
          </button>
        </div>
      </div>
    </div>
  );
}
