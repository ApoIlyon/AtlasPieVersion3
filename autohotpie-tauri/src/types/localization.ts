export interface LocalizationPack {
  schemaVersion: number;
  language: string;
  version: string;
  strings: Record<string, string>;
  missingKeys: string[];
  fallbackOf?: string | null;
}
