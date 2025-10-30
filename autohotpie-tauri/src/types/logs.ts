export interface AuditLogRecord {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
}

export interface AuditLogSnapshot {
  entries: AuditLogRecord[];
  file_path: string;
  filePath?: string;
  truncated: boolean;
}
