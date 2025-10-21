import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useHotkeyStore } from '../../state/hotkeyStore';
import { selectProfileHotkeyStatus, useProfileStore } from '../../state/profileStore';
import type { ProfileRecord } from '../../state/profileStore';
import { PieMenu, type PieSliceDefinition } from '../pie/PieMenu';

export interface ProfileEditorProps {
  profile: ProfileRecord | null;
  mode?: 'view' | 'create';
  onClose?: () => void;
}

interface BreadcrumbItem {
  id: string;
  label: string;
}

const SLICE_MIN = 2;
const SLICE_MAX = 12;
const MENU_DEPTH_MAX = 3;

function computeMenuDepth(menuId: string | null, menuMap: Map<string, { slices: { childMenu?: string | null }[] }>, visited: Set<string>): number {
  if (!menuId || visited.has(menuId)) {
    return 0;
  }
  visited.add(menuId);
  const menu = menuMap.get(menuId);
  if (!menu) {
    return 0;
  }
  let depth = 1;
  for (const slice of menu.slices ?? []) {
    if (slice.childMenu) {
      depth = Math.max(depth, 1 + computeMenuDepth(slice.childMenu, menuMap, visited));
    }
  }
  visited.delete(menuId);
  return depth;
}

const KEY_LABEL_MAP: Record<string, string> = {
  ' ': 'Space',
  Space: 'Space',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Enter: 'Enter',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  CapsLock: 'CapsLock',
  ScrollLock: 'ScrollLock',
  Pause: 'Pause',
  PrintScreen: 'PrintScreen',
  NumLock: 'NumLock',
  ContextMenu: 'ContextMenu',
};

function isModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'AltGraph' || key === 'Meta';
}

function normalizeAccelerator(event: KeyboardEvent): string | null {
  if (event.key === 'Escape' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    return null;
  }

  const modifiers: string[] = [];
  if (event.ctrlKey || event.key === 'Control') {
    modifiers.push('Ctrl');
  }
  if (event.shiftKey || event.key === 'Shift') {
    modifiers.push('Shift');
  }
  if (event.altKey || event.key === 'Alt' || event.key === 'AltGraph') {
    modifiers.push('Alt');
  }
  if (event.metaKey || event.key === 'Meta') {
    modifiers.push('Meta');
  }

  const rawKey = KEY_LABEL_MAP[event.key] ?? (event.key?.length === 1 ? event.key.toUpperCase() : event.key);
  if (!rawKey || isModifierKey(rawKey) || rawKey === 'Dead' || rawKey === 'Unidentified') {
    return null;
  }

  const accelerator = Array.from(new Set([...modifiers, rawKey]));
  if (!accelerator.length) {
    return null;
  }
  return accelerator.join('+');
}

interface HotkeyCaptureButtonProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onStart?: () => void;
  onCapture: (accelerator: string) => void;
  onCancel?: () => void;
}

function HotkeyCaptureButton({ value, placeholder, disabled, onStart, onCapture, onCancel }: HotkeyCaptureButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    function stopRecording(callback?: () => void) {
      setIsRecording(false);
      if (callback) {
        callback();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isRecording) {
        return;
      }
      if (event.key === 'Escape' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        stopRecording(onCancel);
        return;
      }

      const accelerator = normalizeAccelerator(event);
      if (!accelerator) {
        if (!isModifierKey(event.key)) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      stopRecording(() => onCapture(accelerator));
    }

    function handleMouseDown(event: MouseEvent) {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        stopRecording(onCancel);
      }
    }

    function handleWindowBlur() {
      stopRecording(onCancel);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isRecording, onCancel, onCapture]);

  const handleStart = useCallback(() => {
    if (disabled) {
      return;
    }
    onStart?.();
    setIsRecording(true);
    requestAnimationFrame(() => {
      buttonRef.current?.focus();
    });
  }, [disabled, onStart]);

  const label = isRecording ? 'Press shortcut…' : value || placeholder || 'Press to set';

  return (
    <div className="flex w-full flex-col gap-1">
      <button
        ref={buttonRef}
        type="button"
        className={clsx(
          'w-full rounded-2xl border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-accent',
          isRecording
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-white/15 bg-black/20 text-white/80 hover:border-white/25 hover:bg-black/25',
          disabled && 'cursor-not-allowed opacity-60 hover:border-white/15 hover:bg-black/20',
        )}
        onClick={handleStart}
        disabled={disabled}
      >
        <span className={clsx(!value && !isRecording && 'text-white/40')}>{label}</span>
      </button>
      {isRecording && (
        <span className="text-[11px] uppercase tracking-[0.25em] text-white/40">Listening for key combination…</span>
      )}
    </div>
  );
}

function CreateProfilePlaceholder({ onClose }: { onClose?: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">Profile Editor</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">Create Automation Profile</h3>
          <p className="mt-3 max-w-xl text-sm text-white/60">
            Define profile metadata, assign a global hotkey, and scaffold the root pie menu. Backend
            persistence will hook into this surface once profile commands are available.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-white/60">
            Start by giving the profile a name and optional description. You can set a global hotkey
            for quick activation and choose whether the profile is enabled by default.
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-white/60">
            Once created, you will be able to add menus and slices, attach actions, and nest child pie
            menus to build complex hierarchies.
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectProfilePlaceholder({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-16 text-center text-white/60">
      <div className="text-lg font-semibold text-white">Select a profile to begin editing</div>
      <p className="max-w-md text-sm text-white/60">
        Choose a profile from the dashboard to explore its menus, slices, and nested pie structure.
      </p>
      {onClose && (
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/20"
          onClick={onClose}
        >
          Close
        </button>
      )}
    </div>
  );
}

interface ProfileEditorContentProps {
  profile: ProfileRecord;
  onClose?: () => void;
}

export function ProfileEditor({ profile, mode = 'view', onClose }: ProfileEditorProps) {
  const resolvedMode: 'view' | 'create' = profile ? 'view' : mode;

  if (resolvedMode === 'create') {
    return <CreateProfilePlaceholder onClose={onClose} />;
  }

  if (!profile) {
    return <SelectProfilePlaceholder onClose={onClose} />;
  }

  return <ProfileEditorContent profile={profile} onClose={onClose} />;
}

function ProfileEditorContent({ profile, onClose }: ProfileEditorContentProps) {
  const menus = profile.menus ?? [];
  const activationRules = profile.profile.activationRules ?? [];
  const profileStore = useProfileStore();
  const { registerHotkey, isSubmitting, error: hotkeyError, clearError } = useHotkeyStore((state) => ({
    registerHotkey: state.registerHotkey,
    isSubmitting: state.isSubmitting,
    error: state.error,
    clearError: state.clearError,
  }));
  const profileHotkeyStatus = useProfileStore(selectProfileHotkeyStatus);
  const clearProfileHotkeyStatus = useProfileStore((state) => state.clearHotkeyStatus);
  const [hotkeyValue, setHotkeyValue] = useState(profile.profile.globalHotkey ?? '');
  const [hotkeyMessage, setHotkeyMessage] = useState<string | null>(null);
  const [hotkeySubmitting, setHotkeySubmitting] = useState(false);

  const rootMenuId = useMemo(() => {
    if (!menus.length) {
      return null;
    }
    if (profile.profile.rootMenu && menus.some((menu) => menu.id === profile.profile.rootMenu)) {
      return profile.profile.rootMenu;
    }
    return menus[0]?.id ?? null;
  }, [menus, profile.profile.rootMenu]);

  const [menuPath, setMenuPath] = useState<string[]>(() => (rootMenuId ? [rootMenuId] : []));
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);

  useEffect(() => {
    if (!rootMenuId) {
      setMenuPath([]);
      setActiveSliceId(null);
      return;
    }
    setMenuPath([rootMenuId]);
    setActiveSliceId(null);
  }, [rootMenuId, profile.profile.id]);

  const currentMenuId = menuPath[menuPath.length - 1] ?? rootMenuId;
  const currentMenu = currentMenuId ? menus.find((menu) => menu.id === currentMenuId) ?? null : null;
  const currentSlices = currentMenu?.slices ?? [];

  const pieSlices = useMemo<PieSliceDefinition[]>(() => {
    return currentSlices.map((slice, index) => ({
      id: slice.id,
      label: slice.label || `Slice ${index + 1}`,
      order: slice.order ?? index,
      disabled: !slice.action && !slice.childMenu,
    }));
  }, [currentSlices]);

  const breadcrumbItems: BreadcrumbItem[] = [{ id: 'profile-root', label: profile.profile.name ?? 'Profile' }];
  menuPath.forEach((menuId, index) => {
    const menu = menus.find((item) => item.id === menuId);
    breadcrumbItems.push({ id: `menu-${index}-${menuId}`, label: menu?.title || `Menu ${index + 1}` });
  });

  const selectedSlice = useMemo(() => {
    if (!activeSliceId) {
      return null;
    }
    return currentSlices.find((slice) => slice.id === activeSliceId) ?? null;
  }, [activeSliceId, currentSlices]);

  const menuMap = useMemo(() => {
    return new Map((menus ?? []).map((menu) => [menu.id, menu]));
  }, [menus]);

  const overallDepth = useMemo(() => {
    return computeMenuDepth(rootMenuId ?? null, menuMap, new Set());
  }, [menuMap, rootMenuId]);

  const depthExceeded = overallDepth > MENU_DEPTH_MAX;
  const sliceCountExceeded = currentSlices.length > SLICE_MAX;
  const sliceCountTooLow = currentSlices.length > 0 && currentSlices.length < SLICE_MIN;

  useEffect(() => {
    setHotkeyValue(profile.profile.globalHotkey ?? '');
  }, [profile.profile.globalHotkey]);

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      if (index === 0) {
        if (rootMenuId) {
          setMenuPath([rootMenuId]);
        }
      } else {
        const nextPath = menuPath.slice(0, index);
        setMenuPath(nextPath);
      }
      setActiveSliceId(null);
    },
    [menuPath, rootMenuId],
  );

  const handleSliceNavigate = useCallback(
    (sliceId: string) => {
      const slice = currentSlices.find((item) => item.id === sliceId);
      if (!slice?.childMenu) {
        return;
      }
      const targetMenuId = slice.childMenu;
      if (!targetMenuId || !menus.find((menu) => menu.id === targetMenuId)) {
        return;
      }
      setMenuPath((prev) => [...prev, targetMenuId]);
      setActiveSliceId(null);
    },
    [currentSlices, menus],
  );

  const handleSliceSelect = useCallback((sliceId: string) => {
    setActiveSliceId(sliceId);
  }, []);

  const handleHotkeySubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearError();
      setHotkeyMessage(null);
      setHotkeySubmitting(true);
      try {
        const accelerator = hotkeyValue.trim();
        await profileStore.saveProfile({
          ...profile,
          profile: {
            ...profile.profile,
            globalHotkey: accelerator.length ? accelerator : null,
          },
        });

        if (accelerator.length) {
          const success = await registerHotkey({
            id: `profile:${profile.profile.id}`,
            accelerator,
            event: 'profiles://activate',
          });
          if (success) {
            setHotkeyMessage('Hotkey registered successfully.');
          } else {
            setHotkeyMessage('Hotkey saved but requires conflict resolution.');
          }
        } else {
          setHotkeyMessage('Hotkey cleared for this profile.');
        }
      } catch {
        setHotkeyMessage(null);
      } finally {
        setHotkeySubmitting(false);
      }
    },
    [clearError, hotkeyValue, profile, profileStore, registerHotkey],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">Profile Editor</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">{profile.profile.name}</h3>
          <p className="mt-3 max-w-2xl text-sm text-white/60">
            Navigate nested pie menus, manage slices, and preview the menu structure with contextual
            breadcrumbs.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/40">
        {breadcrumbItems.map((crumb, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          return (
            <li key={crumb.id} className="flex items-center gap-2">
              {index > 0 && <span className="text-white/30">/</span>}
              <button
                type="button"
                className={clsx(
                  'rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] font-medium transition hover:border-white/20 hover:bg-white/10',
                  isLast && 'border-white/20 bg-white/10 text-white/70',
                )}
                onClick={() => handleBreadcrumbClick(index)}
              >
                {crumb.label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 lg:grid-cols-[360px,1fr]">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Global Hotkey</p>
            <form className="mt-2 space-y-3" onSubmit={handleHotkeySubmit}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="w-full sm:flex-1">
                  <HotkeyCaptureButton
                    value={hotkeyValue}
                    placeholder="Ctrl+Alt+Space"
                    disabled={isSubmitting || hotkeySubmitting}
                    onStart={() => {
                      clearError();
                      setHotkeyMessage(null);
                    }}
                    onCapture={(accelerator) => {
                      setHotkeyValue(accelerator);
                      setHotkeyMessage(`Captured ${accelerator}. Save to apply.`);
                    }}
                    onCancel={() => {
                      setHotkeyMessage('Capture cancelled.');
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSubmitting || hotkeySubmitting}
                  >
                    {isSubmitting || hotkeySubmitting ? 'Saving…' : 'Save hotkey'}
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-white/15 px-3 py-2 text-sm text-white/60 transition hover:border-white/25 hover:text-white/80"
                    onClick={() => {
                      setHotkeyValue('');
                      void profileStore.saveProfile({
                        ...profile,
                        profile: {
                          ...profile.profile,
                          globalHotkey: null,
                        },
                      }).then(() => {
                        setHotkeyMessage('Hotkey cleared for this profile.');
                      });
                    }}
                    disabled={isSubmitting || hotkeySubmitting}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {hotkeyMessage && <p className="text-xs text-white/60">{hotkeyMessage}</p>}
              {hotkeyError && <p className="text-xs text-red-400">{hotkeyError}</p>}
            </form>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">How to choose a shortcut</p>
            <ul className="mt-2 space-y-2 text-xs text-white/60">
              <li>• Prefer combinations like Ctrl+Alt+Key or Cmd+Option+Key.</li>
              <li>• Keep profile hotkeys unique to avoid conflicts.</li>
              <li>• Leave empty to disable the hotkey for this profile.</li>
            </ul>
          </div>
          {profileHotkeyStatus && !profileHotkeyStatus.registered && (
            <div className="space-y-2 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs text-white/70">
              <div className="flex items-center justify-between">
                <p className="uppercase tracking-[0.25em] text-white/50">Conflicts detected</p>
                <button
                  type="button"
                  className="text-[11px] uppercase tracking-[0.25em] text-white/50 transition hover:text-white/80"
                  onClick={clearProfileHotkeyStatus}
                >
                  Dismiss
                </button>
              </div>
              <p>Resolve the issues below before re-registering this shortcut:</p>
              <ul className="space-y-1">
                {profileHotkeyStatus.conflicts.map((conflict, index) => (
                  <li key={`${conflict.code}-${index}`} className="rounded-xl border border-white/15 bg-black/20 px-3 py-2">
                    <span className="font-semibold text-white/80">{conflict.code}</span>
                    {conflict.message ? ` — ${conflict.message}` : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Profile Summary</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{menus.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">Menus</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{activationRules.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">Rules</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{overallDepth}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">Depth</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{currentSlices.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">Slices here</p>
              </div>
            </div>
          </div>

          {(depthExceeded || sliceCountExceeded || sliceCountTooLow) && (
            <div className="space-y-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
              <p className="uppercase tracking-[0.25em] text-red-200/80">Validation alerts</p>
              {depthExceeded && <p>Menu depth {overallDepth} exceeds maximum {MENU_DEPTH_MAX}. Remove nesting or flatten menus.</p>}
              {sliceCountExceeded && (
                <p>
                  This menu has {currentSlices.length} slices. Reduce to {SLICE_MAX} or fewer to avoid runtime errors.
                </p>
              )}
              {sliceCountTooLow && (
                <p>
                  This menu has {currentSlices.length} slice. Add at least {SLICE_MIN - currentSlices.length + 1} more to reach the minimum
                  of {SLICE_MIN}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[360px,1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
            {currentMenu ? (
              <PieMenu
                slices={pieSlices}
                activeSliceId={activeSliceId}
                visible
                centerContent={<span className="text-xs uppercase tracking-[0.3em] text-white/50">{currentMenu.title}</span>}
              />
            ) : (
              <div className="text-sm text-white/60">No menu data available.</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
              <p className="text-2xl font-semibold text-white">{menus.length}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">Menus</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
              <p className="text-2xl font-semibold text-white">{activationRules.length}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">Rules</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">Slices</h4>
              <span className="text-xs uppercase tracking-[0.25em] text-white/40">{currentSlices.length} total</span>
            </div>
            <div className="mt-4 space-y-3">
              {currentSlices.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                  This menu has no slices yet.
                </div>
              )}
              {currentSlices.map((slice) => (
                <div
                  key={slice.id}
                  className={clsx(
                    'rounded-2xl border px-4 py-3 transition',
                    slice.id === activeSliceId
                      ? 'border-accent/60 bg-accent/15 shadow-[0_0_25px_rgba(59,130,246,0.35)]'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      className="text-left text-sm font-medium text-white"
                      onClick={() => handleSliceSelect(slice.id)}
                    >
                      {slice.label || 'Untitled slice'}
                    </button>
                    <div className="flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        Order {slice.order ?? 0}
                      </span>
                      {slice.hotkey && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                          {slice.hotkey}
                        </span>
                      )}
                      {slice.childMenu && (
                        <button
                          type="button"
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/60 transition hover:border-white/20 hover:bg-white/10"
                          onClick={() => handleSliceNavigate(slice.id)}
                        >
                          Nested
                        </button>
                      )}
                    </div>
                  </div>
                  {slice.action && (
                    <p className="mt-2 text-xs text-white/60">Action: {slice.action}</p>
                  )}
                  {!slice.action && !slice.childMenu && (
                    <p className="mt-2 text-xs text-white/60">No action assigned yet.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h4 className="text-lg font-semibold text-white">Slice Details</h4>
            {!selectedSlice && (
              <p className="mt-3 text-sm text-white/60">Select a slice to view details and navigate nested menus.</p>
            )}
            {selectedSlice && (
              <div className="mt-4 space-y-4 text-sm text-white/70">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Label</p>
                  <p className="mt-1 text-base text-white">{selectedSlice.label || 'Untitled slice'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Action</p>
                  <p className="mt-1 text-base text-white/70">{selectedSlice.action || 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Hotkey</p>
                  <p className="mt-1 text-base text-white/70">{selectedSlice.hotkey || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Nested Menu</p>
                  <p className="mt-1 text-base text-white/70">
                    {selectedSlice.childMenu ? 'Linked' : 'None'}
                  </p>
                  {selectedSlice.childMenu && menus.some((menu) => menu.id === selectedSlice.childMenu) && (
                    <button
                      type="button"
                      className="mt-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:bg-white/10"
                      onClick={() => handleSliceNavigate(selectedSlice.id)}
                    >
                      Open Nested Menu
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileEditor;
