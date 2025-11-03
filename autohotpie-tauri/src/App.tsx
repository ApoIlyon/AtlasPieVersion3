import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './state/appStore';
import { useSystemStore } from './state/systemStore';
import { HotkeyConflictDialog } from './components/hotkeys/HotkeyConflictDialog';
import { useHotkeyStore } from './state/hotkeyStore';
import { useProfileStore } from './state/profileStore';
import { isTauriEnvironment } from './utils/tauriEnvironment';
import { RadialPieMenu } from './components/pie/RadialPieMenu';
import { usePieMenuHotkey } from './hooks/usePieMenuHotkey';
import { ActionToast } from './components/feedback/ActionToast';
import type { HotkeyRegistrationStatus } from './types/hotkeys';
import { KandoApp } from './components/kando-style';

const FALLBACK_SLICES = [
  { id: 'fallback-1', label: 'Launch Calculator', order: 0 },
  { id: 'fallback-2', label: 'Open Downloads', order: 1 },
  { id: 'fallback-3', label: 'Mute Audio', order: 2 },
  { id: 'fallback-4', label: 'Screen Record', order: 3 },
];

export function App() {
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const loadProfiles = useProfileStore((state) => state.loadProfiles);
  const initialize = useAppStore((state) => state.initialize);
  const systemInit = useSystemStore((state) => state.init);
  
  const {
    dialogOpen,
    dialogStatus,
    closeDialog,
    retryWithOverride,
    disableConflictingHotkey,
    isSubmitting: isHotkeySubmitting,
  } = useHotkeyStore();

  const pieMenuState = usePieMenuHotkey({
    hotkeyEvent: 'hotkeys://trigger',
    autoCloseMs: 0,
  });
  
  const {
    isOpen: isPieMenuVisible,
    activeSliceId,
    setActiveSlice,
    handleSelect,
    lastAction,
    clearLastAction,
    close: closePieMenu,
  } = pieMenuState;

  // Get menu slices from active profile
  const menuSlices = (() => {
    if (!profiles.length) return FALLBACK_SLICES;
    
    const activeRecord = profiles.find(p => p.profile.id === activeProfileId) ?? profiles[0];
    if (!activeRecord) return FALLBACK_SLICES;
    
    const rootMenu = activeRecord.menus.find(m => m.id === activeRecord.profile.rootMenu) ?? activeRecord.menus[0];
    if (!rootMenu) return FALLBACK_SLICES;
    
    const slices = [...rootMenu.slices]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((slice, i) => ({
        id: slice.id,
        label: slice.label || `Item ${i + 1}`,
        order: slice.order ?? i,
      }));
    
    return slices.length ? slices : FALLBACK_SLICES;
  })();

  // Initialize
  useEffect(() => {
    void initialize();
    void systemInit();
    void loadProfiles();
  }, [initialize, systemInit, loadProfiles]);

  // Register preview hotkey
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    
    void invoke<HotkeyRegistrationStatus>('register_hotkey', {
      request: {
        id: 'preview-pie-menu-toggle',
        accelerator: 'Control+Shift+P',
        event: 'hotkeys://trigger',
        allowConflicts: true,
      },
    });
  }, []);

  // Auto-select first slice when menu opens
  useEffect(() => {
    if (menuSlices.length > 0 && isPieMenuVisible && !activeSliceId) {
      setActiveSlice(menuSlices[0].id);
    }
  }, [activeSliceId, isPieMenuVisible, menuSlices, setActiveSlice]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090a13]">
      {/* Kando-style Editor - Main Interface */}
      <KandoApp />

      {/* Hotkey Conflict Dialog */}
      <HotkeyConflictDialog
        isOpen={dialogOpen}
        status={dialogStatus}
        onClose={closeDialog}
        onRetry={retryWithOverride}
        onDisable={disableConflictingHotkey}
        isSubmitting={isHotkeySubmitting}
      />

      {/* Global Pie Menu Overlay (Alt+Q) */}
      <AnimatePresence>
        {isPieMenuVisible && (
          <motion.div
            key="pie-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
            onClick={closePieMenu}
          >
            <div
              className="flex max-w-xl flex-col items-center gap-6 px-6 text-center"
              onClick={(event) => event.stopPropagation()}
            >
              {menuSlices.length > 0 ? (
                <>
                  <RadialPieMenu
                    slices={menuSlices}
                    visible
                    radius={200}
                    gapDeg={8}
                    activeSliceId={activeSliceId ?? menuSlices[0]?.id ?? null}
                    onHover={(sliceId) => setActiveSlice(sliceId)}
                    onSelect={(sliceId, slice) => handleSelect(sliceId, slice)}
                    onCenterClick={closePieMenu}
                    dataTestId="pie-menu"
                  />
                  <p className="text-sm text-white/70">
                    Press Alt + Q again or click outside to close
                  </p>
                </>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/10 p-10 text-white">
                  <h2 className="text-2xl font-semibold">No slices available</h2>
                  <p className="mt-3 text-sm text-white/80">
                    Add items to your profile to see the pie menu.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Toast */}
      <ActionToast action={lastAction} onDismiss={clearLastAction} />
    </div>
  );
}
