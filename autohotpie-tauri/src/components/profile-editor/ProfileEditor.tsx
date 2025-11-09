import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import clsx from 'clsx';
import { useHotkeyStore } from '../../state/hotkeyStore';
import { selectProfileHotkeyStatus, useProfileStore } from '../../state/profileStore';
import type { ProfileRecord, RadialOverlayActivationMode } from '../../state/profileStore';
import { ContextConditionsPanel } from './ContextConditionsPanel';
import { useLocalization } from '../../hooks/useLocalization';
import { RadialMenu } from '../radial/RadialMenu';
import type { RadialConfig } from '../radial/types';

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

const HOTKEY_MODIFIERS = new Set([
  'ctrl',
  'control',
  'shift',
  'alt',
  'altgraph',
  'meta',
  'cmd',
  'command',
  'option',
  'super',
  'win',
]);

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

function isModifierLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return HOTKEY_MODIFIERS.has(normalized);
}

function normalizeHotkeyForComparison(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
    .join('+');
}

interface HotkeyValidationResult {
  severity: 'info' | 'warning' | 'error' | null;
  message: string | null;
  isValid: boolean;
}

function validateProfileHotkey(
  accelerator: string,
  currentProfileId: string,
  profiles: ProfileRecord[],
): HotkeyValidationResult {
  const trimmed = accelerator.trim();

  if (!trimmed) {
    return {
      severity: 'info',
      message: 'Hotkey cleared. Activate this profile manually or via tray switcher.',
      isValid: true,
    };
  }

  const parts = trimmed
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (!parts.length) {
    return {
      severity: 'error',
      message: 'Hotkey combination is empty.',
      isValid: false,
    };
  }

  const hasNonModifier = parts.some((part) => !isModifierLabel(part));
  if (!hasNonModifier) {
    return {
      severity: 'error',
      message: 'Hotkey must include a non-modifier key.',
      isValid: false,
    };
  }

  const hasModifier = parts.some((part) => isModifierLabel(part));

  const normalizedCandidate = normalizeHotkeyForComparison(trimmed);

  const duplicate = profiles.find((record) => {
    if (record.profile.id === currentProfileId) {
      return false;
    }
    const existing = record.profile.globalHotkey;
    return Boolean(
      existing && normalizeHotkeyForComparison(existing) === normalizedCandidate,
    );
  });

  if (duplicate) {
    return {
      severity: 'error',
      message: `Hotkey already assigned to profile "${duplicate.profile.name}".`,
      isValid: false,
    };
  }

  if (!hasModifier) {
    return {
      severity: 'warning',
      message: 'Consider adding a modifier key to reduce conflicts.',
      isValid: true,
    };
  }

  return {
    severity: null,
    message: null,
    isValid: true,
  };
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

  const { t } = useLocalization();
  const label = isRecording
    ? t('profileEditor.captureListening')
    : value || placeholder || t('profileEditor.capturePrompt');

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
        <span className="text-[11px] uppercase tracking-[0.25em] text-white/40">{t('profileEditor.captureListening')}</span>
      )}
    </div>
  );
}

function CreateProfilePlaceholder({ onClose }: { onClose?: () => void }) {
  const { t } = useLocalization();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">{t('profileEditor.createPlaceholder.label')}</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">{t('profileEditor.createPlaceholder.title')}</h3>
          <p className="mt-3 max-w-xl text-sm text-white/60">{t('profileEditor.createPlaceholder.descriptionA')}</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-white/60">{t('profileEditor.createPlaceholder.descriptionB')}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-white/60">{t('profileEditor.createPlaceholder.descriptionC')}</p>
        </div>
      </div>
    </div>
  );
}

function SelectProfilePlaceholder({ onClose }: { onClose?: () => void }) {
  const { t } = useLocalization();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-16 text-center text-white/60">
      <div className="text-lg font-semibold text-white">{t('profileEditor.selectPlaceholder.title')}</div>
      <p className="max-w-md text-sm text-white/60">{t('profileEditor.selectPlaceholder.body')}</p>
      {onClose && (
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/20"
          onClick={onClose}
        >
          {t('common.close')}
        </button>
      )}
    </div>
  );
}

interface ProfileEditorContentProps {
  profile: ProfileRecord;
  onClose?: () => void;
}

function ProfileEditorContent({ profile, onClose }: ProfileEditorContentProps) {
  const { t } = useLocalization();
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
  const [activationMode, setActivationMode] = useState<RadialOverlayActivationMode>(
    profile.profile.radialOverlayActivationMode ?? 'toggle',
  );
  const [activationSaving, setActivationSaving] = useState(false);
  const [activationModeMessage, setActivationModeMessage] = useState<string | null>(null);
  const validationErrors = profileStore.validationErrors ?? [];
  const profileHotkeyConflicts = profileHotkeyStatus?.conflicts ?? [];
  const shouldShowHotkeyConflicts = Boolean(
    profileHotkeyStatus &&
      !profileHotkeyStatus.registered &&
      profileHotkeyConflicts.length > 0,
  );

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

  // Default colors for slices (matching the overlay defaults)
  const defaultColors = [
    '#60a5fa', // blue
    '#f472b6', // pink
    '#facc15', // yellow
    '#34d399', // green
    '#a855f7', // purple
    '#fb7185', // rose
    '#38bdf8', // sky
    '#fb923c', // orange
  ];

  const breadcrumbItems: BreadcrumbItem[] = [{
    id: 'profile-root',
    label: profile.profile.name || t('profileEditor.breadcrumbProfile'),
  }];
  menuPath.forEach((menuId, index) => {
    const menu = menus.find((item) => item.id === menuId);
    breadcrumbItems.push({
      id: `menu-${index}-${menuId}`,
      label: menu?.title || t('profileEditor.breadcrumbMenu').replace('{index}', String(index + 1)),
    });
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
  const sliceCountTooLow = currentSlices.length < SLICE_MIN;
  const slicesMissing = Math.max(0, SLICE_MIN - currentSlices.length);

  const profileStoreState = useProfileStore(
    useCallback(
      (state) => ({
        profiles: state.profiles,
      }),
      [],
    ),
  );

  const hotkeyValidation = useMemo(
    () => validateProfileHotkey(hotkeyValue, profile.profile.id, profileStoreState.profiles),
    [hotkeyValue, profile.profile.id, profileStoreState.profiles],
  );

  const hasStructureViolations = depthExceeded || sliceCountExceeded || sliceCountTooLow;

  useEffect(() => {
    setHotkeyValue(profile.profile.globalHotkey ?? '');
    setHotkeyMessage(null);
  }, [profile.profile.globalHotkey]);

  useEffect(() => {
    setActivationMode(profile.profile.radialOverlayActivationMode ?? 'toggle');
    setActivationModeMessage(null);
  }, [profile.profile.id, profile.profile.radialOverlayActivationMode]);

  useEffect(() => {
    if (!activationModeMessage || activationSaving) {
      return;
    }
    const timeoutId = window.setTimeout(() => setActivationModeMessage(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [activationModeMessage, activationSaving]);

  const handleActivationModeChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const nextMode = event.target.value as RadialOverlayActivationMode;
      if (
        nextMode === activationMode &&
        profile.profile.radialOverlayActivationMode === nextMode
      ) {
        return;
      }

      const previousMode = activationMode;
      setActivationMode(nextMode);
      setActivationSaving(true);
      setActivationModeMessage('Сохранение…');

      try {
        const saved = await profileStore.saveProfile({
          ...profile,
          profile: {
            ...profile.profile,
            radialOverlayActivationMode: nextMode,
          },
        });

        if (!saved) {
          setActivationMode(previousMode);
          setActivationModeMessage('Не удалось сохранить режим активации');
        } else {
          setActivationModeMessage(
            nextMode === 'hold'
              ? 'Режим «удержание» активирован'
              : 'Режим «переключение» активирован',
          );
        }
      } catch (error) {
        console.error('Failed to update radial overlay activation mode', error);
        setActivationMode(previousMode);
        setActivationModeMessage('Не удалось сохранить режим активации');
      } finally {
        setActivationSaving(false);
      }
    },
    [activationMode, profile, profileStore],
  );

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
      if (!hotkeyValidation.isValid) {
        setHotkeyMessage(t('profileEditor.hotkeyErrorValidation'));
        return;
      }
      if (hasStructureViolations) {
        setHotkeyMessage(t('profileEditor.hotkeyErrorStructure'));
        return;
      }
      clearError();
      profileStore.clearValidationErrors();
      setHotkeyMessage(null);
      setHotkeySubmitting(true);
      try {
        const accelerator = hotkeyValue.trim();
        const saved = await profileStore.saveProfile({
          ...profile,
          profile: {
            ...profile.profile,
            globalHotkey: accelerator.length ? accelerator : null,
          },
        });

        if (!saved) {
          setHotkeyMessage(t('profileEditor.hotkeySaveBlocked'));
          return;
        }

        if (accelerator.length) {
          const success = await registerHotkey({
            id: `profile:${profile.profile.id}`,
            accelerator,
            event: 'profiles://activate',
          });
          if (success) {
            setHotkeyMessage(t('profileEditor.hotkeySavedRegistered'));
          } else {
            setHotkeyMessage(t('profileEditor.hotkeySavedConflicts'));
          }
        } else {
          setHotkeyMessage(t('profileEditor.hotkeyCleared'));
        }
      } catch {
        setHotkeyMessage(null);
      } finally {
        setHotkeySubmitting(false);
      }
    },
    [clearError, hotkeyValue, profile, profileStore, registerHotkey],
  );

  const canAddSlice = !sliceCountExceeded;
  const canRemoveSlice = currentSlices.length > SLICE_MIN;

  const handleAddSlice = useCallback(async (afterSliceId?: string) => {
    if (!canAddSlice || !currentMenu) return;
    // Пока backend принимает только добавление в меню, игнорируем позицию и даём ему решить order
    await profileStore.addSliceToMenu(profile.profile.id, currentMenu.id);
  }, [canAddSlice, currentMenu, profile.profile.id, profileStore]);

  const handleRemoveSlice = useCallback(async (sliceId: string) => {
    if (!currentMenu || !canRemoveSlice) return;
    await profileStore.removeSliceFromMenu(profile.profile.id, currentMenu.id, sliceId);
  }, [canRemoveSlice, currentMenu, profile.profile.id, profileStore]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">{t('profileEditor.headerLabel')}</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">{profile.profile.name}</h3>
          <p className="mt-3 max-w-2xl text-sm text-white/60">{t('profileEditor.headerDescription')}</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            {t('common.close')}
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
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">{t('profileEditor.hotkeyTitle')}</p>
            <form className="mt-2 space-y-3" onSubmit={handleHotkeySubmit}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="w-full sm:flex-1">
                  <HotkeyCaptureButton
                    value={hotkeyValue}
                    placeholder={t('profileEditor.hotkeyPlaceholder')}
                    disabled={isSubmitting || hotkeySubmitting}
                    onStart={() => {
                      clearError();
                      profileStore.clearValidationErrors();
                      setHotkeyMessage(null);
                    }}
                    onCapture={(accelerator) => {
                      profileStore.clearValidationErrors();
                      setHotkeyValue(accelerator);
                      const validation = validateProfileHotkey(
                        accelerator,
                        profile.profile.id,
                        profileStoreState.profiles,
                      );
                      setHotkeyMessage(
                        validation.severity && validation.severity !== 'info'
                          ? null
                          : t('profileEditor.hotkeyCaptured').replace('{accelerator}', accelerator),
                      );
                    }}
                    onCancel={() => {
                      setHotkeyMessage(t('profileEditor.hotkeyCaptureCancelled'));
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      isSubmitting ||
                      hotkeySubmitting ||
                      !hotkeyValidation.isValid ||
                      hotkeyValidation.severity === 'error' ||
                      hasStructureViolations
                    }
                  >
                    {isSubmitting || hotkeySubmitting ? t('profileEditor.saving') : t('profileEditor.saveHotkeyButton')}
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-white/15 px-3 py-2 text-sm text-white/60 transition hover:border-white/25 hover:text-white/80"
                    onClick={() => {
                      setHotkeyValue('');
                      clearError();
                      profileStore.clearValidationErrors();
                      void (async () => {
                        const saved = await profileStore.saveProfile({
                          ...profile,
                          profile: {
                            ...profile.profile,
                            globalHotkey: null,
                          },
                        });
                        if (saved) {
                          setHotkeyMessage(t('profileEditor.hotkeyCleared'));
                        } else {
                          setHotkeyMessage(t('profileEditor.hotkeyClearFailed'));
                        }
                      })();
                    }}
                    disabled={
                      isSubmitting || hotkeySubmitting || hasStructureViolations
                    }
                  >
                    {t('common.clear')}
                  </button>
                </div>
              </div>
              {hotkeyValidation.message && (
                <p
                  className={clsx(
                    'text-xs',
                    hotkeyValidation.severity === 'error'
                      ? 'text-red-400'
                      : hotkeyValidation.severity === 'warning'
                        ? 'text-amber-300'
                        : 'text-white/60',
                  )}
                >
                  {hotkeyValidation.message}
                </p>
              )}
              {hotkeyMessage && <p className="text-xs text-white/60">{hotkeyMessage}</p>}
              {hotkeyError && <p className="text-xs text-red-400">{hotkeyError}</p>}
              {hasStructureViolations && (
                <p className="text-xs text-red-400">
                  {t('profileEditor.hotkeyStructureWarning')}
                </p>
              )}
            </form>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Режим активации</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-white/70">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name={`radial-activation-${profile.profile.id}`}
                  value="toggle"
                  checked={activationMode === 'toggle'}
                  onChange={handleActivationModeChange}
                  disabled={activationSaving}
                  className="h-4 w-4 accent-accent"
                />
                <span>Переключение — меню остаётся открытым после нажатия</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name={`radial-activation-${profile.profile.id}`}
                  value="hold"
                  checked={activationMode === 'hold'}
                  onChange={handleActivationModeChange}
                  disabled={activationSaving}
                  className="h-4 w-4 accent-accent"
                />
                <span>Удержание — меню видно пока зажата горячая клавиша</span>
              </label>
            </div>
            {activationModeMessage && (
              <p className="mt-3 text-xs text-white/60">{activationModeMessage}</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">{t('profileEditor.hotkeyTipsTitle')}</p>
            <ul className="mt-2 space-y-2 text-xs text-white/60">
              <li>{t('profileEditor.hotkeyTip1')}</li>
              <li>{t('profileEditor.hotkeyTip2')}</li>
              <li>{t('profileEditor.hotkeyTip3')}</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('profileEditor.summaryTitle')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{menus.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">{t('profileEditor.summaryMenus')}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{activationRules.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">{t('profileEditor.summaryRules')}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{overallDepth}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">{t('profileEditor.summaryDepth')}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-2xl font-semibold text-white">{currentSlices.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/50">{t('profileEditor.summarySlicesHere')}</p>
              </div>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
              <p className="uppercase tracking-[0.25em] text-red-200/80">{t('profileEditor.backendErrorsTitle')}</p>
              <ul className="space-y-2">
                {validationErrors.map((error, index) => (
                  <li
                    key={`${error}-${index}`}
                    className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-red-100"
                  >
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(depthExceeded || sliceCountExceeded || sliceCountTooLow) && (
            <div className="space-y-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
              <p className="uppercase tracking-[0.25em] text-red-200/80">{t('profileEditor.validationTitle')}</p>
              {depthExceeded && (
                <p>{t('profileEditor.validationDepth').replace('{depth}', String(overallDepth)).replace('{maxDepth}', String(MENU_DEPTH_MAX))}</p>
              )}
              {sliceCountExceeded && (
                <p>{t('profileEditor.validationSliceMax').replace('{count}', String(currentSlices.length)).replace('{max}', String(SLICE_MAX))}</p>
              )}
              {sliceCountTooLow && (
                <p>
                  {t('profileEditor.validationSliceMin')
                    .replace('{count}', String(currentSlices.length))
                    .replace('{missing}', String(slicesMissing))
                    .replace('{min}', String(SLICE_MIN))}
                </p>
              )}
            </div>
          )}
          <ContextConditionsPanel profile={profile} />
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
            {currentMenu ? (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">{currentMenu.title}</p>
                <div className="flex justify-center">
                  <RadialMenu
                    config={{
                      radius: 160,
                      itemSize: 62,
                      spacing: 14,
                      shortcut: '',
                      activationMode: 'toggle',
                      items: currentSlices.map((slice, index) => ({
                        id: slice.id,
                        label: slice.label || t('profileEditor.sliceUntitled'),
                        command: slice.action,
                        color: slice.color || defaultColors[index % defaultColors.length],
                      })),
                    }}
                    onItemClick={(item) => handleSliceSelect(item.id)}
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/60">{t('profileEditor.previewEmpty')}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
              <p className="text-2xl font-semibold text-white">{menus.length}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">{t('profileEditor.summaryMenus')}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
              <p className="text-2xl font-semibold text-white">{activationRules.length}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">{t('profileEditor.summaryRules')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">{t('profileEditor.slicesTitle')}</h4>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-[0.25em] text-white/40">
                  {t('profileEditor.slicesTotal').replace('{count}', String(currentSlices.length))}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-accent transition hover:bg-accent/20"
                  onClick={() => {
                    // TODO: Add slice functionality
                    console.log('Add slice');
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {currentSlices.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                  {t('profileEditor.slicesEmpty')}
                </div>
              )}
              {currentSlices.map((slice, index) => {
                const sliceColor = slice.color || defaultColors[index % defaultColors.length];
                return (
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
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className="h-4 w-4 rounded-full border border-white/20 flex-shrink-0"
                          style={{ backgroundColor: sliceColor }}
                          title={sliceColor}
                        />
                        <button
                          type="button"
                          className="text-left text-sm font-medium text-white"
                          onClick={() => handleSliceSelect(slice.id)}
                        >
                          {slice.label || t('profileEditor.sliceUntitled')}
                        </button>
                      </div>
                    <div className="flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        {t('profileEditor.sliceOrder').replace('{order}', String(slice.order ?? 0))}
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
                          {t('profileEditor.sliceNestedButton')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-400 transition hover:bg-red-500/20"
                        onClick={() => {
                          // TODO: Delete slice functionality
                          console.log('Delete slice', slice.id);
                        }}
                        title="Delete slice"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {slice.action && (
                    <p className="mt-1 text-xs text-white/60">
                      {t('profileEditor.sliceAction').replace('{action}', String(slice.action))}
                    </p>
                  )}
                  {!slice.action && !slice.childMenu && (
                    <p className="mt-1 text-xs text-white/60">{t('profileEditor.sliceNoAction')}</p>
                  )}
                </div>
              );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleAddSlice()}
                disabled={!canAddSlice || !currentMenu}
                className={clsx(
                  'rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition',
                  canAddSlice && currentMenu
                    ? 'bg-accent/80 text-black hover:bg-accent'
                    : 'bg-white/5 text-white/40 cursor-not-allowed',
                )}
              >
                {t('profileEditor.sliceAddButton' as any) || 'Добавить срез'}
              </button>
              {sliceCountExceeded && (
                <p className="text-[0.65rem] uppercase tracking-[0.25em] text-red-300/80">
                  {t('profileEditor.validationSliceMax')
                    .replace('{count}', String(currentSlices.length))
                    .replace('{max}', String(SLICE_MAX))}
                </p>
              )}
              {sliceCountTooLow && (
                <p className="text-[0.65rem] uppercase tracking-[0.25em] text-yellow-300/80">
                  {t('profileEditor.validationSliceMin')
                    .replace('{count}', String(currentSlices.length))
                    .replace('{missing}', String(slicesMissing))
                    .replace('{min}', String(SLICE_MIN))}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h4 className="text-lg font-semibold text-white">{t('profileEditor.sliceDetailsTitle')}</h4>
            {!selectedSlice && <p className="mt-3 text-sm text-white/60">{t('profileEditor.sliceDetailsEmpty')}</p>}
            {selectedSlice && (
              <div className="mt-4 space-y-4 text-sm text-white/70">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{t('profileEditor.sliceDetailsLabel')}</p>
                  <p className="mt-1 text-base text-white">{selectedSlice.label || t('profileEditor.sliceUntitled')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{t('profileEditor.sliceDetailsAction')}</p>
                  <p className="mt-1 text-base text-white/70">{selectedSlice.action || t('profileEditor.sliceNotAssigned')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{t('profileEditor.sliceDetailsHotkey')}</p>
                  <p className="mt-1 text-base text-white/70">{selectedSlice.hotkey || t('profileEditor.sliceNotSet')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{t('profileEditor.sliceDetailsNested')}</p>
                  <p className="mt-1 text-base text-white/70">
                    {selectedSlice.childMenu ? t('profileEditor.sliceNestedLinked') : t('profileEditor.sliceNestedNone')}
                  </p>
                  {selectedSlice.childMenu && menus.some((menu) => menu.id === selectedSlice.childMenu) && (
                    <button
                      type="button"
                      className="mt-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:bg-white/10"
                      onClick={() => handleSliceNavigate(selectedSlice.id)}
                    >
                      {t('profileEditor.sliceOpenNested')}
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
