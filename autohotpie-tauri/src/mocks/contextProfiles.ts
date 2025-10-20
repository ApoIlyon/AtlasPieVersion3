import contextProfilesJson from './context-profiles.json';

export type MockMatchMode = 'processName' | 'windowTitle';

export interface MockContextRule {
  mode: MockMatchMode;
  value: string;
  caseSensitive?: boolean;
}

export interface MockProfileSegment {
  id: string;
  label: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface MockContextProfile {
  id: string;
  name: string;
  segments: MockProfileSegment[];
  contextRules: MockContextRule[];
}

export interface MockContextProfilesFile {
  profiles: MockContextProfile[];
}

const contextProfiles = contextProfilesJson as MockContextProfilesFile;

export interface MockSelection {
  index: number;
  name: string;
  matchKind: 'processName' | 'windowTitle' | 'fallback';
}

function normalize(value: string, caseSensitive?: boolean) {
  return caseSensitive ? value : value.toLowerCase();
}

function matchesRule(rule: MockContextRule, target?: string | null): boolean {
  if (!target) {
    return false;
  }
  const needle = normalize(rule.value.trim(), rule.caseSensitive);
  if (!needle) {
    return false;
  }
  const haystack = normalize(target.trim(), rule.caseSensitive);
  if (rule.mode === 'processName') {
    return haystack === needle;
  }
  // window title: allow substring match to mimic flexible matching
  return haystack.includes(needle);
}

export function selectMockActiveProfile(
  processName?: string | null,
  windowTitle?: string | null,
): MockSelection | null {
  let fallback: MockSelection | null = null;
  contextProfiles.profiles.forEach((profile, index) => {
    if (!profile.contextRules.length && !fallback) {
      fallback = { index, name: profile.name, matchKind: 'fallback' };
    }
  });

  for (let index = 0; index < contextProfiles.profiles.length; index += 1) {
    const profile = contextProfiles.profiles[index];
    if (!profile.contextRules.length) {
      continue;
    }

    for (const rule of profile.contextRules) {
      const target = rule.mode === 'processName' ? processName : windowTitle;
      if (matchesRule(rule, target)) {
        return {
          index,
          name: profile.name,
          matchKind: rule.mode,
        };
      }
    }
  }

  return fallback;
}

export function slicesForProfile(index: number) {
  const profile = contextProfiles.profiles[index];
  if (!profile) {
    return [];
  }

  return profile.segments.map((segment, order) => ({
    id: segment.id,
    label: segment.label,
    order,
  }));
}

export default contextProfiles;
