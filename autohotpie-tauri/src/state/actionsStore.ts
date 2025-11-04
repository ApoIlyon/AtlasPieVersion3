import { create } from 'zustand';
import { nanoid } from 'nanoid/non-secure';
import {
  cloneActionDefinition,
  createEmptyActionDefinition,
  reorderSteps,
  type ActionDefinition,
  type MacroStep,
} from '../types/actions';

const STORAGE_KEY = 'autohotpie.actions.workspace.v1';

type StoredPayload = {
  actions: ActionDefinition[];
  savedAt: string | null;
};

type ActionsWorkspaceState = {
  actions: ActionDefinition[];
  activeActionId: string | null;
  isLoading: boolean;
  error: string | null;
  lastSavedAt: string | null;
  loadActions: () => Promise<void>;
  selectAction: (actionId: string | null) => void;
  createAction: (name?: string | null) => ActionDefinition;
  updateAction: (action: ActionDefinition) => void;
  deleteAction: (actionId: string) => void;
  duplicateAction: (actionId: string) => ActionDefinition | null;
  clearError: () => void;
};

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('Failed to parse actions payload', error);
    return null;
  }
}

function persistActions(actions: ActionDefinition[]): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const payload: StoredPayload = {
    actions,
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload.savedAt;
  } catch (error) {
    console.warn('Failed to persist actions workspace', error);
    return null;
  }
}

function loadActionsFromStorage(): StoredPayload {
  if (typeof window === 'undefined') {
    return { actions: [], savedAt: null };
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = safeJsonParse<StoredPayload>(raw);
  if (!parsed?.actions?.length) {
    return { actions: [], savedAt: null };
  }
  return {
    actions: parsed.actions.map((action) => normalizeAction(cloneActionDefinition(action))),
    savedAt: parsed.savedAt ?? null,
  };
}

function normalizeAction(action: ActionDefinition): ActionDefinition {
  const trimmedName = action.name.trim().length ? action.name.trim() : 'Untitled Action';
  const steps = reorderSteps(action.steps.map((step) => ({ ...step })));
  return {
    ...action,
    name: trimmedName,
    steps,
  };
}

function cloneWithNewIds(action: ActionDefinition): ActionDefinition {
  const clone = cloneActionDefinition(action);
  return {
    ...clone,
    id: nanoid(),
    name: `${clone.name} Copy`,
    steps: clone.steps.map<MacroStep>((step, index) => ({
      ...step,
      id: nanoid(),
      order: index,
    })),
    lastValidatedAt: null,
  };
}

export const useActionsStore = create<ActionsWorkspaceState>((set, get) => ({
  actions: [],
  activeActionId: null,
  isLoading: false,
  error: null,
  lastSavedAt: null,
  async loadActions() {
    if (get().isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const payload = loadActionsFromStorage();
      set({
        actions: payload.actions,
        activeActionId: payload.actions[0]?.id ?? null,
        isLoading: false,
        lastSavedAt: payload.savedAt,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить действия.';
      set({ isLoading: false, error: message });
    }
  },
  selectAction(actionId) {
    set({ activeActionId: actionId });
  },
  createAction(name) {
    const action = normalizeAction(createEmptyActionDefinition(undefined, name ?? undefined));
    set((state) => {
      const actions = [...state.actions, action];
      const savedAt = persistActions(actions) ?? state.lastSavedAt;
      return {
        actions,
        activeActionId: action.id,
        lastSavedAt: savedAt,
      };
    });
    return action;
  },
  updateAction(action) {
    const normalized = normalizeAction(action);
    set((state) => {
      const index = state.actions.findIndex((candidate) => candidate.id === normalized.id);
      const actions = index >= 0 ? [...state.actions] : [...state.actions, normalized];
      actions[index >= 0 ? index : actions.length - 1] = normalized;
      const savedAt = persistActions(actions) ?? state.lastSavedAt;
      return {
        actions,
        lastSavedAt: savedAt,
        activeActionId: normalized.id,
      };
    });
  },
  deleteAction(actionId) {
    set((state) => {
      const actions = state.actions.filter((action) => action.id !== actionId);
      const nextActive = state.activeActionId === actionId ? actions[0]?.id ?? null : state.activeActionId;
      const savedAt = persistActions(actions) ?? state.lastSavedAt;
      return {
        actions,
        activeActionId: nextActive,
        lastSavedAt: savedAt,
      };
    });
  },
  duplicateAction(actionId) {
    const source = get().actions.find((action) => action.id === actionId);
    if (!source) {
      return null;
    }
    const clone = normalizeAction(cloneWithNewIds(source));
    set((state) => {
      const actions = [...state.actions, clone];
      const savedAt = persistActions(actions) ?? state.lastSavedAt;
      return {
        actions,
        activeActionId: clone.id,
        lastSavedAt: savedAt,
      };
    });
    return clone;
  },
  clearError() {
    set({ error: null });
  },
}));
