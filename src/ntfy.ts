import type { LoadedBackendConfig, NotifyEvent } from "./config.js";

export const DEFAULT_TITLES: Record<NotifyEvent, string> = {
  "session.idle": "Agent Idle",
  "session.error": "Agent Error",
  "permission.asked": "Permission Needed",
  "question.asked": "Response Needed",
};

export const DEFAULT_MESSAGES: Record<NotifyEvent, string> = {
  "session.idle": "The agent finished and is waiting for input.",
  "session.error": "An error occurred while processing the session.",
  "permission.asked": "The agent needs permission to continue.",
  "question.asked": "The agent asked a question and is waiting for your response.",
};

export const DEFAULT_TAGS: Record<NotifyEvent, string> = {
  "session.idle": "hourglass_done",
  "session.error": "warning",
  "permission.asked": "lock",
  "question.asked": "question",
};

export type NtfyPayload = {
  event: NotifyEvent;
  title: string;
  message: string;
  iconUrl?: string;
};

function buildUrl(server: string, topic: string): string {
  return `${server.replace(/\/+$/, "")}/${topic}`;
}

export async function sendNtfyNotification(
  backend: LoadedBackendConfig,
  payload: NtfyPayload,
): Promise<void> {
  const headers: Record<string, string> = {
    Title: payload.title,
    Priority: backend.priority,
    Tags: DEFAULT_TAGS[payload.event],
  };

  if (payload.iconUrl) {
    headers.Icon = payload.iconUrl;
  }

  if (backend.token) {
    headers.Authorization = `Bearer ${backend.token}`;
  }

  const response = await fetch(buildUrl(backend.server, backend.topic), {
    method: "POST",
    headers,
    body: payload.message,
    ...(backend.fetchTimeoutMs === undefined
      ? {}
      : { signal: AbortSignal.timeout(backend.fetchTimeoutMs) }),
  });

  if (!response.ok) {
    throw new Error(`ntfy request failed: ${response.status} ${response.statusText}`);
  }
}
