import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
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
