export interface HotkeyConflictMeta {
  conflictingId?: string;
}

export interface HotkeyConflict {
  code: string;
  message: string;
  meta?: HotkeyConflictMeta;
}

export interface HotkeyAlternative {
  id: string;
  accelerator: string;
}

export interface HotkeyJournalEntry {
  kind: string;
  accelerator: string;
}

export interface HotkeyRegistrationStatus {
  registered: boolean;
  conflicts: HotkeyConflict[];
  alternatives?: HotkeyAlternative[];
  journalEntry?: HotkeyJournalEntry;
}

export interface HotkeyConflictSnapshot {
  id: string;
  accelerator: string;
  registered: boolean;
  conflicts: HotkeyConflict[];
}

export type MatchKind = 'processName' | 'windowTitle' | 'fallback';

export interface ActiveProfileSnapshot {
  index: number;
  name: string;
  matchKind: MatchKind;
}
