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
  { id: 'radial-browser', label: 'Browser', action: 'https://www.example.com', order: 0 },
  { id: 'radial-mail', label: 'Mail', action: 'mailto:', order: 1 },
  { id: 'radial-editor', label: 'Editor', action: '', order: 2 },
  { id: 'radial-terminal', label: 'Terminal', action: '', order: 3 },
  { id: 'radial-media', label: 'Media', action: '', order: 4 },
  { id: 'radial-search', label: 'Search', action: '', order: 5 }
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
