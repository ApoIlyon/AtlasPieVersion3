import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PieMenu } from '../components/pie/PieMenu';
import '../styles.css';

interface PieOverlayState {
  visible: boolean;
  slices: React.ComponentProps<typeof PieMenu>['slices'];
  activeSliceId: string | null;
  centerLabel?: string | null;
  triggerAccelerator?: string | null;
  activationMode?: 'toggle' | 'hold' | null;
}

const rootElement = document.getElementById('pie-overlay-root');

if (!rootElement) {
  throw new Error('Failed to find pie overlay root element');
}

const OverlayContext = React.createContext<{
  close: () => void;
  selectSlice: (sliceId: string) => void;
}>({
  close: () => {},
  selectSlice: () => {},
});

const PieOverlayApp: React.FC = () => {
  const [state, setState] = React.useState<PieOverlayState>({
    visible: false,
    slices: [],
    activeSliceId: null,
    centerLabel: null,
    triggerAccelerator: null,
    activationMode: 'toggle',
  });

  React.useEffect(() => {
    const previousBodyBg = document.body.style.backgroundColor;
    const previousHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = previousBodyBg;
      document.documentElement.style.backgroundColor = previousHtmlBg;
    };
  }, []);

  const closeOverlay = React.useCallback(() => {
    void invoke('pie_overlay_hide').catch((error) => {
      console.error('Failed to invoke pie_overlay_hide', error);
    });
  }, []);

  const selectSlice = React.useCallback((sliceId: string) => {
    void invoke('pie_overlay_select_slice', {
      payload: { sliceId },
    }).catch((error) => {
      console.error('Failed to invoke pie_overlay_select_slice', error);
    });
  }, []);

  const parseAccelerator = React.useCallback((accelerator: string | null | undefined): Set<string> | null => {
    if (!accelerator) {
      return null;
    }
    const normalize = (key: string) => {
      const lower = key.toLowerCase();
      if (lower === ' ' || lower === 'space' || lower === 'spacebar') return 'space';
      if (lower === 'ctrl' || lower === 'control') return 'ctrl';
      if (lower === 'shift') return 'shift';
      if (lower === 'alt' || lower === 'option') return 'alt';
      if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win') return 'meta';
      return lower;
    };
    const parts = accelerator
      .split('+')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => normalize(part));
    return new Set(parts);
  }, []);

  React.useEffect(() => {
    if (!state.visible || state.activationMode !== 'hold') {
      return;
    }

    const required = parseAccelerator(state.triggerAccelerator);
    if (!required) {
      return;
    }

    const pressed = new Set<string>();

    const normalize = (key: string) => {
      const lower = key.toLowerCase();
      if (lower === ' ' || lower === 'space' || lower === 'spacebar') return 'space';
      if (lower === 'ctrl' || lower === 'control') return 'ctrl';
      if (lower === 'shift') return 'shift';
      if (lower === 'alt' || lower === 'option') return 'alt';
      if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win') return 'meta';
      return lower;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      pressed.add(normalize(event.key ?? event.code ?? ''));
      if (event.ctrlKey) pressed.add('ctrl');
      if (event.shiftKey) pressed.add('shift');
      if (event.altKey) pressed.add('alt');
      if (event.metaKey) pressed.add('meta');
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      pressed.delete(normalize(event.key ?? event.code ?? ''));
      if (!event.ctrlKey) pressed.delete('ctrl');
      if (!event.shiftKey) pressed.delete('shift');
      if (!event.altKey) pressed.delete('alt');
      if (!event.metaKey) pressed.delete('meta');

      const allPressed = Array.from(required).every((key) => pressed.has(key));
      if (!allPressed) {
        closeOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      pressed.clear();
    };
  }, [closeOverlay, parseAccelerator, state.activationMode, state.triggerAccelerator, state.visible]);

  React.useEffect(() => {
    const unlisten = listen<PieOverlayState>('pie-overlay://state', (event) => {
      console.debug('pie overlay state update', event.payload);
      setState(event.payload);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  React.useEffect(() => {
    // Notify backend that overlay hydrated
    void invoke('pie_overlay_ready').catch((error) => {
      console.error('Failed to invoke pie_overlay_ready', error);
    });
  }, []);

  const activeSlice = React.useMemo(
    () => state.slices.find((slice) => slice.id === state.activeSliceId) ?? null,
    [state.slices, state.activeSliceId],
  );

  return (
    <OverlayContext.Provider value={{ close: closeOverlay, selectSlice }}>
      <div
        className="fixed inset-0 flex min-h-screen items-center justify-center"
        style={{
          pointerEvents: state.visible ? 'auto' : 'none',
          opacity: state.visible ? 1 : 0,
          transition: 'opacity 80ms ease-out',
          backgroundColor: 'transparent',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
        onClick={closeOverlay}
      >
        <div
          className="flex max-w-xl flex-col items-center gap-6 px-6 text-center"
          style={{ background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none' }}
          onClick={(event) => event.stopPropagation()}
        >
          <PieMenu
            slices={state.slices}
            visible={state.visible}
            radius={200}
            gapDeg={8}
            activeSliceId={state.activeSliceId}
            onHover={(sliceId) => {
              void invoke('pie_overlay_focus_slice', {
                payload: { sliceId },
              }).catch((error) => {
                console.error('Failed to invoke pie_overlay_focus_slice', error);
              });
            }}
            onSelect={(sliceId) => {
              selectSlice(sliceId);
            }}
            dataTestId="pie-menu"
          />
          {state.centerLabel && (
            <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/80">
              {state.centerLabel}
            </div>
          )}
          {activeSlice && (
            <p className="text-sm text-white/70">{activeSlice.label}</p>
          )}
        </div>
      </div>
    </OverlayContext.Provider>
  );
};

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PieOverlayApp />
  </React.StrictMode>,
);
