import { nanoid } from 'nanoid/non-secure';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PieSliceConfig = {
  id: string;
  label: string;
  action: string;
  order: number;
  disabled?: boolean;
};

interface PieMenuConfigState {
  slices: PieSliceConfig[];
  fallbackHotkeys: string[];
  updateSlice: (id: string, data: Partial<Omit<PieSliceConfig, 'id'>>) => void;
  addSlice: () => void;
  removeSlice: (id: string) => void;
  setFallbackHotkeys: (hotkeys: string[]) => void;
  reset: () => void;
}

const DEFAULT_SLICES: PieSliceConfig[] = [
  { id: nanoid(), label: 'Launch Browser', action: 'shell:browser', order: 0 },
  { id: nanoid(), label: 'Open Editor', action: 'shell:editor', order: 1 },
  { id: nanoid(), label: 'Mute Audio', action: 'system:mute', order: 2 },
  { id: nanoid(), label: 'Clipboard History', action: 'shell:clipboard', order: 3 },
  { id: nanoid(), label: 'Screenshot', action: 'system:screenshot', order: 4 },
  { id: nanoid(), label: 'Quick Record', action: 'system:record', order: 5 },
  { id: nanoid(), label: 'Window Layout', action: 'system:layout', order: 6 },
  { id: nanoid(), label: 'Task Switcher', action: 'system:tasks', order: 7 }
];

const DEFAULT_HOTKEYS = ['Control+Alt+Space'];

export const usePieMenuConfigStore = create<PieMenuConfigState>()(
  persist(
    (set, get) => ({
      slices: DEFAULT_SLICES,
      fallbackHotkeys: DEFAULT_HOTKEYS,
      updateSlice: (id, data) => {
        set((state) => ({
          slices: state.slices
            .map((slice) => (slice.id === id ? { ...slice, ...data } : slice))
            .sort((a, b) => a.order - b.order),
        }));
      },
      addSlice: () => {
        set((state) => {
          if (state.slices.length >= 12) {
            return state;
          }
          const nextOrder = state.slices.length;
          const nextSlice: PieSliceConfig = {
            id: nanoid(),
            label: `Slice ${nextOrder + 1}`,
            action: 'none',
            order: nextOrder,
          };
          return {
            slices: [...state.slices, nextSlice].sort((a, b) => a.order - b.order),
          };
        });
      },
      removeSlice: (id) => {
        set((state) => {
          const remaining = state.slices.filter((slice) => slice.id !== id);
          return {
            slices: remaining
              .map((slice, index) => ({ ...slice, order: index }))
              .sort((a, b) => a.order - b.order),
          };
        });
      },
      setFallbackHotkeys: (hotkeys) => {
        const cleaned = hotkeys
          .map((hotkey) => hotkey.trim())
          .filter((hotkey) => hotkey.length > 0);
        set({ fallbackHotkeys: cleaned.length ? cleaned : DEFAULT_HOTKEYS });
      },
      reset: () => {
        set({ slices: DEFAULT_SLICES, fallbackHotkeys: DEFAULT_HOTKEYS });
      },
    }),
    {
      name: 'pie-menu-config',
      version: 1,
      partialize: (state) => ({
        slices: state.slices,
        fallbackHotkeys: state.fallbackHotkeys,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<PieMenuConfigState> | undefined;
        if (!data) {
          return current;
        }
        return {
          ...current,
          slices: data.slices?.length ? data.slices : current.slices,
          fallbackHotkeys: data.fallbackHotkeys?.length
            ? data.fallbackHotkeys
            : current.fallbackHotkeys,
        };
      },
    }
  )
);
