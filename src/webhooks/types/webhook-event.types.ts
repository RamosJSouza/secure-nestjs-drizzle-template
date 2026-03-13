export interface WebhookEventPayload {
  event: string;
  organizationId: string;
  data: Record<string, unknown>;
  timestamp: string;
}
