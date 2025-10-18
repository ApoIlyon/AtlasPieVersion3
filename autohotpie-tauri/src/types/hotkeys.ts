export interface HotkeyConflict {
  code: string;
  message: string;
}

export interface HotkeyRegistrationStatus {
  registered: boolean;
  conflicts: HotkeyConflict[];
}

export type MatchKind = 'processName' | 'windowTitle' | 'fallback';

export interface ActiveProfileSnapshot {
  index: number;
  name: string;
  matchKind: MatchKind;
}
