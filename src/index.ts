import { basename } from "node:path";
import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  loadConfigFromFile,
  type LoadedSmartNtfyConfig,
  type NotifyEvent,
} from "./config.js";
import { DEFAULT_MESSAGES, DEFAULT_TITLES, sendNtfyNotification } from "./ntfy.js";
import { resolveTemplate, type TemplateVariables } from "./templates.js";

type RuntimeEvent = Parameters<NonNullable<Hooks["event"]>>[0]["event"];

export type SessionKind = "main" | "subagent";

const NOTIFY_POLICY: Record<NotifyEvent, Record<SessionKind, boolean>> = {
  "session.idle": { main: true, subagent: false },
  "session.error": { main: true, subagent: false },
  "permission.asked": { main: true, subagent: true },
  "question.asked": { main: true, subagent: true },
};

type RuntimeEventLike = RuntimeEvent & {
  type: string;
  properties?: Record<string, unknown>;
};

type SessionInfoLike = {
  id?: string;
  parentID?: string;
};

function getEventType(event: RuntimeEvent): string {
  return (event as RuntimeEventLike).type;
}

function getEventProperties(event: RuntimeEvent): Record<string, unknown> {
  return ((event as RuntimeEventLike).properties ?? {}) as Record<string, unknown>;
}

function getInfo(event: RuntimeEvent): SessionInfoLike | undefined {
  const info = getEventProperties(event).info;
  if (typeof info === "object" && info !== null) {
    return info as SessionInfoLike;
  }

  return undefined;
}

export function getNotificationEvent(event: RuntimeEvent): NotifyEvent | null {
  switch (getEventType(event)) {
    case "session.idle":
    case "session.error":
    case "permission.asked":
    case "question.asked":
      return getEventType(event) as NotifyEvent;
    default:
      return null;
  }
}

export function getSessionID(event: RuntimeEvent): string | undefined {
  const properties = getEventProperties(event);

  switch (getEventType(event)) {
    case "session.created":
    case "session.updated":
    case "session.deleted":
    case "session.idle":
    case "session.error":
    case "permission.asked":
    case "question.asked":
      return typeof properties.sessionID === "string"
        ? properties.sessionID
        : typeof getInfo(event)?.id === "string"
          ? getInfo(event)?.id
          : undefined;
    default:
      return undefined;
  }
}

export function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }

  return "";
}

export function rememberSession(
  cache: Map<string, SessionKind>,
  sessionID: string | undefined,
  info: { id?: string; parentID?: string },
): void {
  const id = info.id || sessionID;

  if (!id) {
    return;
  }

  cache.set(id, info.parentID ? "subagent" : "main");
}

export async function classifySession(
  client: PluginInput["client"],
  cache: Map<string, SessionKind>,
  sessionID?: string,
): Promise<SessionKind> {
  if (!sessionID) {
    return "main";
  }

  const cached = cache.get(sessionID);
  if (cached) {
    return cached;
  }

  try {
    const response = await client.session.get({ path: { id: sessionID } });
    const kind: SessionKind = response.data?.parentID ? "subagent" : "main";
    cache.set(sessionID, kind);
    return kind;
  } catch {
    return "main";
  }
}

export function buildTemplateVariables(
  projectName: string,
  event: RuntimeEvent,
): TemplateVariables {
  const properties = getEventProperties(event);

  switch (getEventType(event)) {
    case "session.idle":
      return {
        project: projectName,
        session_id: typeof properties.sessionID === "string" ? properties.sessionID : "",
        error: "",
        permission_type: "",
        permission_patterns: "",
        question: "",
      };
    case "session.error":
      return {
        project: projectName,
        session_id: typeof properties.sessionID === "string" ? properties.sessionID : "",
        error: getErrorMessage(properties.error),
        permission_type: "",
        permission_patterns: "",
        question: "",
      };
    case "permission.asked":
      return {
        project: projectName,
        session_id: typeof properties.sessionID === "string" ? properties.sessionID : "",
        error: "",
        permission_type: typeof properties.permission === "string" ? properties.permission : "",
        permission_patterns: Array.isArray(properties.patterns)
          ? properties.patterns.join(",")
          : "",
        question: "",
      };
    case "question.asked":
      return {
        project: projectName,
        session_id: typeof properties.sessionID === "string" ? properties.sessionID : "",
        error: "",
        permission_type: "",
        permission_patterns: "",
        question: Array.isArray(properties.questions)
          ? ((properties.questions[0] as { question?: string } | undefined)?.question ?? "")
          : "",
      };
    default:
      return {
        project: projectName,
        session_id: "",
        error: "",
        permission_type: "",
        permission_patterns: "",
        question: "",
      };
  }
}

export function createSmartNtfyHooks({
  client,
  projectName,
  config,
  $,
  send,
}: {
  client: PluginInput["client"];
  projectName: string;
  config: LoadedSmartNtfyConfig;
  $: PluginInput["$"];
  send: (payload: {
    event: NotifyEvent;
    title: string;
    message: string;
    iconUrl?: string | undefined;
  }) => Promise<void>;
}): Hooks {
  const lifecycleCache = new Map<string, SessionKind>();

  return {
    event: async ({ event }) => {
      const sessionID = getSessionID(event);

      switch (getEventType(event)) {
        case "session.created":
        case "session.updated":
          rememberSession(lifecycleCache, sessionID, getInfo(event) ?? {});
          return;
        case "session.deleted": {
          const id = getInfo(event)?.id || sessionID;
          if (id) {
            lifecycleCache.delete(id);
          }
          return;
        }
      }

      const notifyEvent = getNotificationEvent(event);
      if (!notifyEvent) {
        return;
      }

      if (!config.enabled || !config.events[notifyEvent].enabled) {
        return;
      }

      const sessionKind = await classifySession(client, lifecycleCache, sessionID);
      if (!NOTIFY_POLICY[notifyEvent][sessionKind]) {
        return;
      }

      try {
        const variables = buildTemplateVariables(projectName, event);
        const title = await resolveTemplate(
          config.backend.title[notifyEvent],
          DEFAULT_TITLES[notifyEvent],
          variables,
          $,
        );
        const message = await resolveTemplate(
          config.backend.message[notifyEvent],
          DEFAULT_MESSAGES[notifyEvent],
          variables,
          $,
        );

        await send({
          event: notifyEvent,
          title,
          message,
          iconUrl: config.backend.iconUrl,
        });
      } catch {
        return;
      }
    },
  };
}

const plugin: Plugin = async (input) => {
  const config = loadConfigFromFile();
  const projectName = basename(input.directory);

  return createSmartNtfyHooks({
    client: input.client,
    projectName,
    config,
    $: input.$,
    send: async (payload) => {
      if (payload.iconUrl === undefined) {
        await sendNtfyNotification(config.backend, {
          event: payload.event,
          title: payload.title,
          message: payload.message,
        });
        return;
      }

      await sendNtfyNotification(config.backend, {
        event: payload.event,
        title: payload.title,
        message: payload.message,
        iconUrl: payload.iconUrl,
      });
    },
  });
};

export default plugin;
