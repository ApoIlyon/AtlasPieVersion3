import { useMemo } from 'react';
import clsx from 'clsx';
import type { ProfileRecord } from '../state/profileStore';

export interface ProfilesDashboardProps {
  profiles: ProfileRecord[];
  activeProfileId?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onCreateProfile?: () => void;
  onOpenEditor?: (profileId: string) => void;
  onActivateProfile?: (profileId: string) => void;
}

interface ProfileMetrics {
  menus: number;
  slices: number;
  nested: number;
}

function computeMetrics(record: ProfileRecord): ProfileMetrics {
  const menus = record.menus?.length ?? 0;
  let slices = 0;
  let nested = 0;
  (record.menus ?? []).forEach((menu) => {
    (menu.slices ?? []).forEach((slice) => {
      slices += 1;
      if (slice.childMenu) {
        nested += 1;
      }
    });
  });
  return { menus, slices, nested };
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-12 text-center text-white/60">
      <div className="text-lg font-semibold text-white">No profiles yet</div>
      <p className="max-w-md text-sm text-white/60">
        Create your first automation profile to start designing pie menus, assign hotkeys, and
        organize actions for different contexts.
      </p>
      {onCreate && (
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/20"
          onClick={onCreate}
        >
          Create Profile
        </button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-[0_0_35px_rgba(15,23,42,0.35)] backdrop-blur-xl"
        >
          <div className="h-6 w-1/2 animate-pulse rounded bg-white/10" />
          <div className="mt-6 h-16 w-full animate-pulse rounded bg-white/5" />
          <div className="mt-4 h-10 w-full animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export function ProfilesDashboard({
  profiles,
  activeProfileId,
  isLoading,
  error,
  onCreateProfile,
  onOpenEditor,
  onActivateProfile,
}: ProfilesDashboardProps) {
  const sortedProfiles = useMemo(() => {
    return profiles
      .filter((record): record is ProfileRecord => Boolean(record && record.profile))
      .slice()
      .sort((a, b) => a.profile.name.localeCompare(b.profile.name));
  }, [profiles]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">Profiles</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Automation Profiles</h2>
          <p className="mt-2 text-sm text-white/60">
            Manage pie menu presets, activation rules, and global hotkeys for each workflow.
          </p>
        </div>
        {onCreateProfile && (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/10 px-5 py-2 text-sm font-medium text-white shadow-[0_0_25px_rgba(59,130,246,0.35)] transition hover:border-white/20 hover:bg-white/20"
            onClick={onCreateProfile}
          >
            New Profile
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : sortedProfiles.length === 0 ? (
        <EmptyState onCreate={onCreateProfile} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sortedProfiles.map((record) => {
            const metrics = computeMetrics(record);
            const isActive = record.profile.id === activeProfileId;
            return (
              <div
                key={record.profile.id}
                className={clsx(
                  'flex h-full flex-col justify-between rounded-3xl border px-6 py-6 text-white shadow-[0_0_35px_rgba(15,23,42,0.35)] backdrop-blur-xl transition',
                  isActive
                    ? 'border-accent/60 bg-accent/15 shadow-[0_0_45px_rgba(59,130,246,0.45)]'
                    : 'border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10',
                )}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{record.profile.name}</h3>
                      {record.profile.description && (
                        <p className="mt-2 text-sm text-white/60">{record.profile.description}</p>
                      )}
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.35em] text-white/60">
                      {isActive ? 'Active' : 'Ready'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.25em] text-white/50">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      Hotkey {record.profile.globalHotkey || '—'}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      {record.profile.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      {(record.profile.activationRules?.length ?? 0) > 0
                        ? `${record.profile.activationRules?.length ?? 0} rule${(record.profile.activationRules?.length ?? 0) === 1 ? '' : 's'}`
                        : 'No rules'}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
                      <p className="text-2xl font-semibold text-white">{metrics.menus}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">Menus</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
                      <p className="text-2xl font-semibold text-white">{metrics.slices}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">Slices</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
                      <p className="text-2xl font-semibold text-white">{metrics.nested}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">Nested</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {onOpenEditor && (
                    <button
                      type="button"
                      className="w-full rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/20"
                      onClick={() => onOpenEditor(record.profile.id)}
                    >
                      Open Editor
                    </button>
                  )}
                  {onActivateProfile && !isActive && (
                    <button
                      type="button"
                      className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
                      onClick={() => onActivateProfile(record.profile.id)}
                    >
                      Set Active
                    </button>
                  )}
                  {isActive && (
                    <div className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-center text-sm font-medium text-white/70">
                      Currently Active
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ProfilesDashboard;
