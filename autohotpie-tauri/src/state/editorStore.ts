import { create } from 'zustand';
import { produce } from 'immer';

export interface PieMenu {
  id: string;
  title: string;
  slices: PieSlice[];
}

export interface PieSlice {
  id: string;
  label: string;
  order: number;
  icon?: string;
  actionId?: string;
  childMenuId?: string;
  disabled?: boolean;
  accentColor?: string;
}

export interface EditorSnapshot {
  menu: PieMenu;
  selectedSliceId: string | null;
  timestamp: number;
}

export interface EditorAction {
  type: string;
  description: string;
}

interface EditorStore {
  // History state
  past: EditorSnapshot[];
  present: EditorSnapshot;
  future: EditorSnapshot[];
  
  // UI state
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadMenu: (menu: PieMenu) => void;
  updateMenu: (updater: (draft: PieMenu) => void, action: EditorAction) => void;
  selectSlice: (sliceId: string | null) => void;
  
  // History actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  
  // Slice operations
  addSlice: (slice: Partial<PieSlice>) => void;
  updateSlice: (sliceId: string, updates: Partial<PieSlice>) => void;
  deleteSlice: (sliceId: string) => void;
  reorderSlices: (sliceIds: string[]) => void;
  duplicateSlice: (sliceId: string) => void;
  
  // Validation
  validate: () => { isValid: boolean; errors: string[] };
  
  // Reset
  reset: () => void;
}

const MAX_HISTORY = 50;
const MAX_SLICES = 12;
const MAX_DEPTH = 3;

const createEmptySnapshot = (): EditorSnapshot => ({
  menu: {
    id: '',
    title: 'Untitled Menu',
    slices: [],
  },
  selectedSliceId: null,
  timestamp: Date.now(),
});

const pushSnapshot = (
  past: EditorSnapshot[],
  current: EditorSnapshot
): EditorSnapshot[] => {
  const newPast = [...past, current];
  if (newPast.length > MAX_HISTORY) {
    return newPast.slice(1);
  }
  return newPast;
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Initial state
  past: [],
  present: createEmptySnapshot(),
  future: [],
  isDirty: false,
  isLoading: false,
  error: null,

  // Load menu
  loadMenu: (menu) => {
    set({
      present: {
        menu,
        selectedSliceId: null,
        timestamp: Date.now(),
      },
      past: [],
      future: [],
      isDirty: false,
      error: null,
    });
  },

  // Update menu with undo/redo support
  updateMenu: (updater, action) => {
    const { present, past } = get();
    
    const newMenu = produce(present.menu, updater);
    const newSnapshot: EditorSnapshot = {
      menu: newMenu,
      selectedSliceId: present.selectedSliceId,
      timestamp: Date.now(),
    };

    set({
      present: newSnapshot,
      past: pushSnapshot(past, present),
      future: [], // Clear future on new action
      isDirty: true,
      error: null,
    });
  },

  // Select slice
  selectSlice: (sliceId) => {
    set((state) => ({
      present: {
        ...state.present,
        selectedSliceId: sliceId,
      },
    }));
  },

  // Undo
  undo: () => {
    const { past, present, future } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);

    set({
      past: newPast,
      present: previous,
      future: [present, ...future],
      isDirty: true,
    });
  },

  // Redo
  redo: () => {
    const { past, present, future } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    set({
      past: [...past, present],
      present: next,
      future: newFuture,
      isDirty: true,
    });
  },

  // Can undo/redo
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // Clear history
  clearHistory: () => {
    set({ past: [], future: [], isDirty: false });
  },

  // Add slice
  addSlice: (slice) => {
    const { updateMenu, present } = get();
    const slices = present.menu.slices;

    if (slices.length >= MAX_SLICES) {
      set({ error: `Maximum ${MAX_SLICES} slices allowed` });
      return;
    }

    const newSlice: PieSlice = {
      id: slice.id || `slice-${Date.now()}`,
      label: slice.label || 'New Slice',
      order: slice.order ?? slices.length,
      icon: slice.icon,
      actionId: slice.actionId,
      childMenuId: slice.childMenuId,
      disabled: slice.disabled ?? false,
      accentColor: slice.accentColor,
    };

    updateMenu((draft) => {
      draft.slices.push(newSlice);
    }, {
      type: 'ADD_SLICE',
      description: `Added slice "${newSlice.label}"`,
    });
  },

  // Update slice
  updateSlice: (sliceId, updates) => {
    const { updateMenu } = get();

    updateMenu((draft) => {
      const slice = draft.slices.find((s) => s.id === sliceId);
      if (slice) {
        Object.assign(slice, updates);
      }
    }, {
      type: 'UPDATE_SLICE',
      description: `Updated slice "${sliceId}"`,
    });
  },

  // Delete slice
  deleteSlice: (sliceId) => {
    const { updateMenu, present } = get();
    const slice = present.menu.slices.find((s) => s.id === sliceId);

    updateMenu((draft) => {
      draft.slices = draft.slices.filter((s) => s.id !== sliceId);
      // Reorder remaining slices
      draft.slices.forEach((s, index) => {
        s.order = index;
      });
    }, {
      type: 'DELETE_SLICE',
      description: `Deleted slice "${slice?.label || sliceId}"`,
    });
  },

  // Reorder slices
  reorderSlices: (sliceIds) => {
    const { updateMenu } = get();

    updateMenu((draft) => {
      const sliceMap = new Map(draft.slices.map((s) => [s.id, s]));
      draft.slices = sliceIds
        .map((id) => sliceMap.get(id))
        .filter((s): s is PieSlice => s !== undefined)
        .map((s, index) => ({ ...s, order: index }));
    }, {
      type: 'REORDER_SLICES',
      description: 'Reordered slices',
    });
  },

  // Duplicate slice
  duplicateSlice: (sliceId) => {
    const { updateMenu, present } = get();
    const slice = present.menu.slices.find((s) => s.id === sliceId);

    if (!slice) return;
    if (present.menu.slices.length >= MAX_SLICES) {
      set({ error: `Maximum ${MAX_SLICES} slices allowed` });
      return;
    }

    updateMenu((draft) => {
      const newSlice: PieSlice = {
        ...slice,
        id: `slice-${Date.now()}`,
        label: `${slice.label} (Copy)`,
        order: draft.slices.length,
      };
      draft.slices.push(newSlice);
    }, {
      type: 'DUPLICATE_SLICE',
      description: `Duplicated slice "${slice.label}"`,
    });
  },

  // Validate
  validate: () => {
    const { present } = get();
    const errors: string[] = [];

    // Check slice count
    if (present.menu.slices.length < 2) {
      errors.push('Menu must have at least 2 slices');
    }
    if (present.menu.slices.length > MAX_SLICES) {
      errors.push(`Menu cannot have more than ${MAX_SLICES} slices`);
    }

    // Check for duplicate labels
    const labels = present.menu.slices.map((s) => s.label);
    const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate labels found: ${duplicates.join(', ')}`);
    }

    // Check for empty labels
    const emptyLabels = present.menu.slices.filter((s) => !s.label.trim());
    if (emptyLabels.length > 0) {
      errors.push('All slices must have labels');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  // Reset
  reset: () => {
    set({
      past: [],
      present: createEmptySnapshot(),
      future: [],
      isDirty: false,
      isLoading: false,
      error: null,
    });
  },
}));

// Selectors
export const selectCurrentMenu = (state: EditorStore) => state.present.menu;
export const selectSelectedSlice = (state: EditorStore) => {
  const { present } = state;
  if (!present.selectedSliceId) return null;
  return present.menu.slices.find((s) => s.id === present.selectedSliceId) ?? null;
};
export const selectCanUndo = (state: EditorStore) => state.past.length > 0;
export const selectCanRedo = (state: EditorStore) => state.future.length > 0;
export const selectIsDirty = (state: EditorStore) => state.isDirty;
