import contextProfilesJson from './context-profiles.json' assert { type: 'json' };
import type { ActivationRule, PieMenu, PieSlice, ProfileRecord } from '../state/profileStore';

interface MockContextProfilesFile {
  profiles: ProfileRecord[];
}

const contextProfiles = contextProfilesJson as MockContextProfilesFile;

export interface MockSelection {
  index: number;
  name: string;
  matchKind: 'processName' | 'windowTitle' | 'fallback';
  holdToOpen: boolean;
}

function normalize(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.toLowerCase();
}

function matchesActivationRule(rule: ActivationRule, processName?: string | null, windowTitle?: string | null): boolean {
  const mode = rule.mode;
  if (mode === 'process_name') {
    const needle = normalize(rule.value?.trim());
    const haystack = normalize(processName?.trim());
    return Boolean(needle) && haystack === needle;
  }

  if (mode === 'window_title') {
    const needle = normalize(rule.value?.trim());
    const haystack = normalize(windowTitle?.trim());
    return Boolean(needle) && haystack.includes(needle);
  }

  // Unsupported modes fallback to no match in mock environment.
  return false;
}

function rootMenuForRecord(record: ProfileRecord): PieMenu | null {
  const root = record.profile.rootMenu;
  if (!record.menus?.length) {
    return null;
  }
  return record.menus.find((menu) => menu.id === root) ?? record.menus[0] ?? null;
}

function sortSlices(slices: PieSlice[]): PieSlice[] {
  return [...slices].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function selectMockActiveProfile(
  processName?: string | null,
  windowTitle?: string | null,
): MockSelection | null {
  let fallback: MockSelection | null = null;

  contextProfiles.profiles.forEach((record, index) => {
    const rules = record.profile.activationRules ?? [];
    if (!rules.length && !fallback) {
      fallback = {
        index,
        name: record.profile.name,
        matchKind: 'fallback',
        holdToOpen: record.profile.holdToOpen ?? false,
      };
    }
  });

  for (let index = 0; index < contextProfiles.profiles.length; index += 1) {
    const record = contextProfiles.profiles[index];
    const rules = record.profile.activationRules ?? [];
    if (!rules.length) {
      continue;
    }

    for (const rule of rules) {
      if (matchesActivationRule(rule, processName, windowTitle)) {
        const matchKind = rule.mode === 'process_name' ? 'processName' : 'windowTitle';
        return {
          index,
          name: record.profile.name,
          matchKind,
          holdToOpen: record.profile.holdToOpen ?? false,
        };
      }
    }
  }

  return fallback;
}

export function slicesForProfile(index: number) {
  const record = contextProfiles.profiles[index];
  if (!record) {
    return [];
  }

  const menu = rootMenuForRecord(record);
  if (!menu) {
    return [];
  }

  return sortSlices(menu.slices ?? []).map((slice, order) => ({
    id: slice.id,
    label: slice.label || `Slice ${order + 1}`,
    order: slice.order ?? order,
  }));
}

export default contextProfiles;
