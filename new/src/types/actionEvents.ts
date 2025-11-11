export type ActionEventStatus = 'success' | 'failure' | 'skipped';

export interface ActionEventPayload {
  eventId: string;
  id: string;
  name: string;
  status: ActionEventStatus;
  durationMs: number;
  message?: string | null;
  timestamp: string;
  invocationId?: string | null;
}
