import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './state/appStore';
import { useSystemStore } from './state/systemStore';
import { OfflineNotice } from './components/feedback/OfflineNotice';
import { ProfileRecoveryDialog } from './components/feedback/ProfileRecoveryDialog';
import { HotkeyConflictDialog } from './components/hotkeys/HotkeyConflictDialog';
import { HotkeyRegistrationPanel } from './components/hotkeys/HotkeyRegistrationPanel';
import { useHotkeyStore } from './state/hotkeyStore';
import { useProfileStore, selectProfileHotkeyStatus } from './state/profileStore';
import { isTauriEnvironment } from './utils/tauriEnvironment';
import { PieMenu, type PieSliceDefinition } from './components/pie/PieMenu';
import { usePieMenuHotkey } from './hooks/usePieMenuHotkey';
import { ActionToast } from './components/feedback/ActionToast';
import { FullscreenNotice } from './components/pie/FullscreenNotice';
import { LinuxFallbackPanel } from './components/tray/LinuxFallbackPanel';
import { MenuBarToggle } from './components/tray/MenuBarToggle';
import type { HotkeyRegistrationStatus } from './types/hotkeys';
import { slicesForProfile } from './mocks/contextProfiles';
import { ProfilesDashboard } from './screens/ProfilesDashboard';
import { ProfileEditor } from './components/profile-editor/ProfileEditor';

type AppSection = 'dashboard' | 'profiles' | 'actions' | 'settings';

const FALLBACK_PLACEHOLDER_SLICES = [
  { id: 'fallback-launch-calculator', label: 'Launch Calculator', order: 0 },
  { id: 'fallback-open-downloads', label: 'Open Downloads', order: 1 },
  { id: 'fallback-mute-audio', label: 'Mute Audio', order: 2 },
  { id: 'fallback-start-record', label: 'Start Screen Record', order: 3 },
  { id: 'fallback-snap-layout', label: 'Snap Layout', order: 4 },
  { id: 'fallback-clipboard-history', label: 'Clipboard History', order: 5 },
  { id: 'fallback-window-layout', label: 'Window Layout', order: 6 },
  { id: 'fallback-task-switcher', label: 'Task Switcher', order: 7 },
];

function useVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      setVersion(null);
      return;
    }

    invoke<string>('get_version').then(setVersion).catch(() => setVersion(null));
  }, []);

  return version;
}

function usePlatform() {
  const [isLinux, setIsLinux] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const detect = () => {
      let linux = false;
      let mac = false;
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        linux = /linux/i.test(navigator.userAgent);
        mac = /macintosh|mac os x/i.test(navigator.userAgent);
      }
      if (typeof window !== 'undefined') {
        const platformHint = (window as unknown as { process?: { platform?: string } }).process?.platform;
        if (platformHint) {
          const normalized = platformHint.toLowerCase();
          linux = linux || normalized === 'linux';
          mac = mac || normalized === 'darwin';
        }
      }
      return { linux, mac };
    };

    const result = detect();
    setIsLinux(result.linux);
    setIsMac(result.mac);
  }, []);

  return { isLinux, isMac };
}

export function App() {
  useEffect(() => {
    if (isTauriEnvironment()) {
      const tauriWindow = window as typeof window & {
        __TAURI__?: {
          window?: {
            appWindow?: {
              openDevtools?: () => Promise<void>;
            };
          };
        };
      };

      void tauriWindow.__TAURI__?.window?.appWindow?.openDevtools?.();
    }
  }, []);

  const version = useVersion();
  const { isLinux, isMac } = usePlatform();
  const { settings, isLoading, error } = useAppStore((state) => ({
    settings: state.settings,
    isLoading: state.isLoading,
    error: state.error,
  }));
  const {
    profiles,
    activeProfileId,
    loadProfiles,
    initialized: profilesInitialized,
    isLoading: profilesLoading,
    error: profilesError,
    activateProfile,
  } = useProfileStore((state) => ({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    loadProfiles: state.loadProfiles,
    initialized: state.initialized,
    isLoading: state.isLoading,
    error: state.error,
    activateProfile: state.activateProfile,
  }));
  const initialize = useAppStore((state) => state.initialize);
  const systemInit = useSystemStore((state) => state.init);
  const systemStatus = useSystemStore((state) => state.status);
  const systemError = useSystemStore((state) => state.error);
  const {
    dialogOpen,
    dialogStatus,
    closeDialog,
    retryWithOverride,
    disableConflictingHotkey,
    isSubmitting: isHotkeySubmitting,
  } = useHotkeyStore((state) => ({
    dialogOpen: state.dialogOpen,
    dialogStatus: state.dialogStatus,
    closeDialog: state.closeDialog,
    retryWithOverride: state.retryWithOverride,
    disableConflictingHotkey: state.disableConflictingHotkey,
    isSubmitting: state.isSubmitting,
  }));
  const retryProfileHotkeyWithOverride = useProfileStore((state) => state.retryProfileHotkeyWithOverride);
  const profileHotkeyStatus = useProfileStore(selectProfileHotkeyStatus);
  const clearProfileHotkeyStatus = useProfileStore((state) => state.clearHotkeyStatus);
  const systemActiveProfile = useSystemStore((state) => state.activeProfile);
  const status = useSystemStore((state) => state.status);
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (!profilesInitialized) {
      void loadProfiles();
    }
  }, [loadProfiles, profilesInitialized]);

  useEffect(() => {
    if (activeSection !== 'profiles') {
      return;
    }
    if (selectedProfileId) {
      return;
    }
    const defaultProfileId = activeProfileId ?? profiles[0]?.profile.id ?? null;
    if (defaultProfileId) {
      setSelectedProfileId(defaultProfileId);
    }
  }, [activeSection, activeProfileId, profiles, selectedProfileId]);

  const activeProfileRecord = useMemo(() => {
    if (!selectedProfileId) {
      return null;
    }
    return profiles.find((record) => record.profile.id === selectedProfileId) ?? null;
  }, [profiles, selectedProfileId]);

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
    lastSafeModeReason,
    activeProfile: pieMenuActiveProfile,
    toggle: togglePieMenu,
    open: openPieMenu,
    close: closePieMenu,
  } = pieMenuState;

  const menuSlices = useMemo<PieSliceDefinition[]>(() => {
    const fallbackSlices = FALLBACK_PLACEHOLDER_SLICES;
    const activeSnapshot = pieMenuActiveProfile ?? systemActiveProfile;

    if (!isTauriEnvironment()) {
      if (activeSnapshot) {
        const mockSlices = slicesForProfile(activeSnapshot.index);
        if (mockSlices.length) {
          return mockSlices;
        }
      }
      const fallbackMock = slicesForProfile(0);
      return fallbackMock.length ? fallbackMock : fallbackSlices;
    }

    if (!profiles.length) {
      return fallbackSlices;
    }

    let activeRecord =
      (activeSnapshot?.index != null ? profiles[activeSnapshot.index] : undefined) ??
      (activeProfileId ? profiles.find((record) => record.profile.id === activeProfileId) : undefined) ??
      profiles[0];

    if (!activeRecord) {
      return fallbackSlices;
    }

    const rootMenu =
      activeRecord.menus.find((menu) => menu.id === activeRecord.profile.rootMenu) ??
      activeRecord.menus[0];

    if (!rootMenu) {
      return fallbackSlices;
    }

    const derivedSlices = [...rootMenu.slices]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map<PieSliceDefinition>((slice, order) => ({
        id: slice.id,
        label: slice.label || `Slice ${order + 1}`,
        order: slice.order ?? order,
      }));

    return derivedSlices.length ? derivedSlices : fallbackSlices;
  }, [activeProfileId, pieMenuActiveProfile, profiles, systemActiveProfile]);

  const previousMatchKindRef = useRef<string | null>(null);

  const isProfileConflictOnly = useMemo(
    () => Boolean(!dialogStatus && profileHotkeyStatus && !profileHotkeyStatus.registered),
    [dialogStatus, profileHotkeyStatus],
  );

  const combinedHotkeyStatus = useMemo(
    () =>
      dialogStatus ??
      (profileHotkeyStatus && !profileHotkeyStatus.registered ? profileHotkeyStatus : null),
    [dialogStatus, profileHotkeyStatus],
  );

  const isConflictDialogOpen = useMemo(
    () => dialogOpen || (!!profileHotkeyStatus && !profileHotkeyStatus.registered),
    [dialogOpen, profileHotkeyStatus],
  );

  const handleHotkeyDialogClose = useCallback(() => {
    closeDialog();
    clearProfileHotkeyStatus();
  }, [clearProfileHotkeyStatus, closeDialog]);

  useEffect(() => {
    const currentKind = pieMenuActiveProfile?.matchKind ?? null;
    const previousKind = previousMatchKindRef.current;
    if (previousKind && currentKind === 'fallback' && previousKind !== 'fallback') {
      setActiveSlice(null);
      clearLastAction();
      closePieMenu();
    }
    previousMatchKindRef.current = currentKind;
  }, [pieMenuActiveProfile, clearLastAction, closePieMenu, setActiveSlice]);

  useEffect(() => {
    void initialize();
    void systemInit();
  }, [initialize, systemInit]);

  useEffect(() => {
    if (menuSlices.length > 0 && isPieMenuVisible && !activeSliceId) {
      setActiveSlice(menuSlices[0].id);
    }
  }, [activeSliceId, isPieMenuVisible, menuSlices, setActiveSlice]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }
    const registerPromise = invoke<HotkeyRegistrationStatus>('register_hotkey', {
      request: {
        id: 'preview-pie-menu-toggle',
        accelerator: 'Control+Shift+P',
        event: 'hotkeys://trigger',
        allowConflicts: true,
      },
    })
      .then((status) => {
        if (!status.registered) {
          console.warn('Preview hotkey registration blocked', status.conflicts);
        }
      })
      .catch((error) => {
        console.error('Failed to register preview hotkey', error);
      });

    return () => {
      void registerPromise;
    };
  }, []);

  const openLogViewer = useCallback(() => {
    if (!isTauriEnvironment()) {
      return;
    }
    void invoke('open_logs');
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090a13] text-text-primary">
      {isMac && (
        <MenuBarToggle
          isPieMenuOpen={isPieMenuVisible}
          onTogglePieMenu={togglePieMenu}
          onOpenPieMenu={openPieMenu}
          onClosePieMenu={closePieMenu}
          lastAction={lastAction}
          lastSafeModeReason={lastSafeModeReason}
        />
      )}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.12),transparent_65%)]" />
        <div className="absolute -top-24 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(244,63,94,0.18),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[-30%] left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.16),transparent_70%)] blur-3xl" />
      </div>
      <HotkeyConflictDialog
        isOpen={isConflictDialogOpen}
        status={combinedHotkeyStatus}
        isSubmitting={isHotkeySubmitting}
        onClose={handleHotkeyDialogClose}
        onRetry={
          isProfileConflictOnly
            ? () => {
                void retryProfileHotkeyWithOverride();
              }
            : retryWithOverride
              ? () => {
                  void retryWithOverride();
                }
              : () => {
                  void retryProfileHotkeyWithOverride();
                }
        }
        onDisable={isProfileConflictOnly ? undefined : disableConflictingHotkey}
      />
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-white/40">AutoHotPie Tauri</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Pie Menu Studio</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/70 shadow-[0_0_20px_rgba(59,130,246,0.25)] transition hover:bg-white/10"
            onClick={openLogViewer}
          >
            OPEN LOG
          </button>
          <div className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70 shadow-[0_0_20px_rgba(148,163,184,0.2)]">
            {version ? `App v${version}` : 'Loading version…'}
          </div>
        </div>
      </header>

      <main className="relative z-10 grid gap-6 px-8 py-10 lg:grid-cols-[320px,1fr]">
        <nav className="space-y-2">
          {(
            [
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'profiles', label: 'Profiles' },
              { id: 'actions', label: 'Actions' },
              { id: 'settings', label: 'Settings' },
            ] as { id: AppSection; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              className={clsx(
                'w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition',
                activeSection === item.id
                  ? 'border-white/15 bg-white/15 text-white'
                  : 'border-white/5 bg-white/5 text-white/70 hover:border-white/10 hover:bg-white/10 hover:text-white',
              )}
              type="button"
              onClick={() => {
                setActiveSection(item.id);
                if (item.id !== 'profiles') {
                  setSelectedProfileId(null);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="rounded-3xl border border-white/5 bg-white/10/10 p-8 shadow-[0_0_35px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          {activeSection === 'dashboard' && (
            <>
              <h2 className="text-2xl font-semibold text-white">Welcome</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                This is the placeholder UI shell for the AutoHotPie Tauri application. Phase 1
                tasks will flesh out the Tailwind token system, React state containers, and
                routing needed to render the pie menu designer, contextual profile editor, and
                settings surfaces inspired by <span className="text-accent">kando-2.0.0</span>.
              </p>

              <div className="mt-6 space-y-4">
                <OfflineNotice />
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {systemError ? (
                    <span className="text-red-400">{systemError}</span>
                  ) : (
                    <>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60">
                        {systemStatus.safeMode ? 'Safe Mode' : 'Normal Mode'} · {systemStatus.storageMode}
                      </span>
                      <span className="text-white/60">
                        {systemStatus.connectivity.isOffline ? 'Offline' : 'Online'} · Last check{' '}
                        {systemStatus.connectivity.lastChecked ?? '—'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/5 bg-white/5 p-6">
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                {!error && (
                  <>
                    <p className="text-sm text-white/70">
                      {isLoading && 'Loading settings…'}
                      {!isLoading && !settings && 'Settings not loaded yet.'}
                      {profilesLoading && ' Loading profiles…'}
                      {!profilesLoading && profilesInitialized &&
                        ` Loaded ${profiles.length} profile${profiles.length === 1 ? '' : 's'}.`}
                    </p>
                    {settings && (
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">
                        Global source: {settings.global?.app ? (settings.global as Record<string, any>).app?.sourceFileName ?? 'N/A' : 'N/A'}
                      </p>
                    )}
                    {profilesError && (
                      <p className="mt-2 text-sm text-red-400">{profilesError}</p>
                    )}
                  </>
                )}

                <div className="mt-8">
                  <HotkeyRegistrationPanel />
                </div>

                <div className="mt-10 grid gap-6 lg:grid-cols-[360px,1fr]">
                  <div className="rounded-3xl border border-white/5 bg-white/5 p-6">
                    <h3 className="text-lg font-semibold text-white">Pie Menu Preview</h3>
                    <p className="mt-2 text-sm text-white/70">
                      Press <span className="font-semibold text-text-primary">Ctrl + Shift + P</span> to
                      toggle a preview of the pie menu. Once contextual routing is connected,
                      the preview will reflect the active profile and slice configuration.
                    </p>

                    <div className="mt-6 flex flex-col items-center gap-4">
                      <PieMenu
                        slices={menuSlices}
                        visible={menuSlices.length > 0}
                        radius={200}
                        gapDeg={8}
                        activeSliceId={activeSliceId ?? menuSlices[0]?.id ?? null}
                        onHover={(sliceId) => setActiveSlice(sliceId)}
                        onSelect={(sliceId, slice) => handleSelect(sliceId, slice)}
                        dataTestId="pie-menu-preview"
                        centerContent={
                          lastSafeModeReason ? (
                            <span className="text-[10px] uppercase tracking-[0.4em] text-rose-100/80">
                              Safe Mode
                            </span>
                          ) : null
                        }
                      />
                      {menuSlices.length === 0 && (
                        <p className="text-sm text-white/60">Add actions to your first profile to preview the menu.</p>
                      )}
                      {lastAction && (
                        <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                          <p className="font-semibold text-white">Last action:</p>
                          <p className="mt-1 text-sm">{lastAction.actionName}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
                            Status: {lastAction.status} · {new Date(lastAction.timestamp).toLocaleTimeString()}
                          </p>
                          {lastAction.message && (
                            <p className="mt-1 text-white/60">{lastAction.message}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/5 bg-white/5 p-6">
                    <h3 className="text-lg font-semibold text-white">Contextual Profiles</h3>
                    <p className="mt-2 text-sm text-white/70">
                      Active profile will be selected automatically based on context rules. When
                      available, we will display the active profile info here.
                    </p>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      <p>Active profile: {pieMenuActiveProfile?.name ?? systemActiveProfile?.name ?? '—'}</p>
                      <p>Match mode: {pieMenuActiveProfile?.matchKind ?? systemActiveProfile?.matchKind ?? '—'}</p>
                      <p>Safe mode: {status.safeMode ? 'Enabled' : 'Disabled'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection === 'profiles' && (
            <div className="space-y-10">
              <ProfilesDashboard
                profiles={profiles}
                activeProfileId={activeProfileId}
                isLoading={profilesLoading}
                error={profilesError}
                onCreateProfile={() => {
                  setSelectedProfileId(null);
                }}
                onOpenEditor={(profileId) => {
                  setSelectedProfileId(profileId);
                }}
                onActivateProfile={(profileId) => {
                  void activateProfile(profileId);
                }}
              />

              <ProfileEditor
                profile={activeProfileRecord}
                mode={activeProfileRecord ? 'view' : 'create'}
                onClose={() => setSelectedProfileId(null)}
              />
            </div>
          )}

          {activeSection === 'actions' && (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-white/60">
              Actions workspace coming soon.
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-white/60">
              Settings panel under construction.
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {isPieMenuVisible && (
          <motion.div
            key="pie-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm"
            onClick={closePieMenu}
          >
            <div
              className="flex max-w-xl flex-col items-center gap-6 px-6 text-center"
              onClick={(event) => event.stopPropagation()}
            >
              {menuSlices.length > 0 ? (
                <>
                  <PieMenu
                    slices={menuSlices}
                    visible
                    radius={200}
                    gapDeg={8}
                    activeSliceId={activeSliceId ?? menuSlices[0]?.id ?? null}
                    onHover={(sliceId) => setActiveSlice(sliceId)}
                    onSelect={(sliceId, slice) => handleSelect(sliceId, slice)}
                    dataTestId="pie-menu"
                  />
                  <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/80">
                    {menuSlices.find((slice) => slice.id === (activeSliceId ?? menuSlices[0]?.id ?? null))?.label ?? ''}
                  </div>
                  <p className="text-sm text-white/70">
                    Нажми `Alt + Q` ещё раз или кликни вне меню, чтобы закрыть.
                  </p>
                </>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/10 p-10 text-white">
                  <h2 className="text-2xl font-semibold">No slices available</h2>
                  <p className="mt-3 text-sm text-white/80">
                    Добавь функции в текущий профиль, чтобы увидеть pie-меню.
                  </p>
                  <p className="mt-5 text-xs uppercase tracking-[0.35em] text-white/60">
                    Alt + Q — закрыть
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ActionToast action={lastAction} onDismiss={clearLastAction} />
      <FullscreenNotice visible={!!lastSafeModeReason} reason={lastSafeModeReason ?? ''} />
      {isLinux && (
        <LinuxFallbackPanel
          isPieMenuOpen={isPieMenuVisible}
          onTogglePieMenu={togglePieMenu}
          onOpenPieMenu={openPieMenu}
          onClosePieMenu={closePieMenu}
          lastAction={lastAction}
          lastSafeModeReason={lastSafeModeReason}
        />
      )}
      <ProfileRecoveryDialog />
    </div>
  );
}
