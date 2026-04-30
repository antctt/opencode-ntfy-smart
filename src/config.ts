import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, toSeconds } from "iso8601-duration";

export const NOTIFY_EVENTS = [
  "session.idle",
  "session.error",
  "permission.asked",
  "question.asked",
] as const;

export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const VALID_PRIORITIES = ["min", "low", "default", "high", "max"] as const;
export type NtfyPriority = (typeof VALID_PRIORITIES)[number];

export const DEFAULT_CONFIG_PATH = join(
  homedir(),
  ".config",
  "opencode",
  "notification-ntfy-smart.json",
);

export type EventToggle = { enabled: boolean };
export type ContentTemplate = { value: string } | { command: string };

export type LoadedBackendConfig = {
  topic: string;
  server: string;
  token?: string;
  priority: NtfyPriority;
  iconUrl?: string;
  fetchTimeoutMs?: number;
  title: Partial<Record<NotifyEvent, ContentTemplate>>;
  message: Partial<Record<NotifyEvent, ContentTemplate>>;
};

export type LoadedSmartNtfyConfig = {
  enabled: boolean;
  events: Record<NotifyEvent, EventToggle>;
  backend: LoadedBackendConfig;
};

const TOP_LEVEL_KEYS = new Set(["$schema", "enabled", "events", "backend"]);
const EVENT_TOGGLE_KEYS = new Set(["enabled"]);
const BACKEND_KEYS = new Set([
  "topic",
  "server",
  "token",
  "priority",
  "icon",
  "fetchTimeout",
  "title",
  "message",
]);
const ICON_KEYS = new Set(["mode", "variant"]);
const ICON_VARIANT_KEYS = new Set(["light", "dark"]);
const CONTENT_TEMPLATE_KEYS = new Set(["value", "command"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(path ? `${path}.${key} is not allowed` : `${key} is not allowed`);
    }
  }
}

function parseOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
}

function parseOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }

  return value;
}

function parseDurationToMs(input: string): number {
  try {
    return Math.round(toSeconds(parse(input)) * 1000);
  } catch {
    throw new Error(`Invalid ISO 8601 duration: ${input}`);
  }
}

function parseTemplate(entry: unknown, path: string): ContentTemplate {
  if (!isRecord(entry)) {
    throw new Error(`${path} must be an object`);
  }

  assertOnlyKeys(entry, CONTENT_TEMPLATE_KEYS, path);

  const hasValue = typeof entry.value === "string";
  const hasCommand = typeof entry.command === "string";

  if (hasValue === hasCommand) {
    throw new Error(`${path} must contain exactly one of "value" or "command"`);
  }

  return hasValue
    ? { value: entry.value as string }
    : { command: entry.command as string };
}

function parseTemplateMap(
  raw: unknown,
  path: string,
): Partial<Record<NotifyEvent, ContentTemplate>> {
  if (raw === undefined) {
    return {};
  }

  if (!isRecord(raw)) {
    throw new Error(`${path} must be an object`);
  }

  const result: Partial<Record<NotifyEvent, ContentTemplate>> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!NOTIFY_EVENTS.includes(key as NotifyEvent)) {
      throw new Error(`${path}.${key} is not a supported event`);
    }

    result[key as NotifyEvent] = parseTemplate(value, `${path}.${key}`);
  }

  return result;
}

function resolveIconUrl(raw: unknown): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!isRecord(raw)) {
    throw new Error("backend.icon must be an object");
  }

  assertOnlyKeys(raw, ICON_KEYS, "backend.icon");

  const modeRaw = raw.mode;
  if (modeRaw !== undefined && modeRaw !== "light" && modeRaw !== "dark") {
    throw new Error('backend.icon.mode must be one of: light, dark');
  }

  const mode = modeRaw === "light" ? "light" : "dark";

  if (raw.variant === undefined) {
    return undefined;
  }

  if (!isRecord(raw.variant)) {
    throw new Error("backend.icon.variant must be an object");
  }

  assertOnlyKeys(raw.variant, ICON_VARIANT_KEYS, "backend.icon.variant");

  const light = parseOptionalString(raw.variant.light, "backend.icon.variant.light");
  const dark = parseOptionalString(raw.variant.dark, "backend.icon.variant.dark");

  const candidate = mode === "light" ? light : dark;

  return typeof candidate === "string" && candidate.trim() !== "" ? candidate : undefined;
}

export function parseSmartNtfyConfig(raw: unknown): LoadedSmartNtfyConfig {
  if (!isRecord(raw)) {
    throw new Error("notification-ntfy-smart.json must contain a JSON object");
  }

  assertOnlyKeys(raw, TOP_LEVEL_KEYS, "");

  const enabled = parseOptionalBoolean(raw.enabled, "enabled") ?? true;

  const schemaRef = parseOptionalString(raw.$schema, "$schema");
  void schemaRef;

  const eventsRaw = raw.events === undefined ? {} : raw.events;
  if (!isRecord(eventsRaw)) {
    throw new Error("events must be an object");
  }

  assertOnlyKeys(eventsRaw, new Set(NOTIFY_EVENTS), "events");

  const events = Object.fromEntries(
    NOTIFY_EVENTS.map((name) => {
      const entry = eventsRaw[name];

      if (entry === undefined) {
        return [name, { enabled: true }];
      }

      if (!isRecord(entry)) {
        throw new Error(`events.${name} must be an object`);
      }

      assertOnlyKeys(entry, EVENT_TOGGLE_KEYS, `events.${name}`);

      return [name, { enabled: parseOptionalBoolean(entry.enabled, `events.${name}.enabled`) ?? true }];
    }),
  ) as Record<NotifyEvent, EventToggle>;

  const backendRaw = raw.backend;
  if (!isRecord(backendRaw)) {
    throw new Error("backend must be an object");
  }

  assertOnlyKeys(backendRaw, BACKEND_KEYS, "backend");

  if (typeof backendRaw.topic !== "string" || backendRaw.topic.trim() === "") {
    throw new Error("backend.topic must be a non-empty string");
  }

  const server = parseOptionalString(backendRaw.server, "backend.server") ?? "https://ntfy.sh";
  const token = parseOptionalString(backendRaw.token, "backend.token");
  const priority = typeof backendRaw.priority === "string" ? backendRaw.priority : "default";
  if (!VALID_PRIORITIES.includes(priority as NtfyPriority)) {
    throw new Error(`backend.priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }

  const iconUrl = resolveIconUrl(backendRaw.icon);
  const fetchTimeoutMs =
    backendRaw.fetchTimeout === undefined
      ? undefined
      : parseDurationToMs(parseOptionalString(backendRaw.fetchTimeout, "backend.fetchTimeout")!);

  const backend: LoadedBackendConfig = {
    topic: backendRaw.topic,
    server,
    priority: priority as NtfyPriority,
    title: parseTemplateMap(backendRaw.title, "backend.title"),
    message: parseTemplateMap(backendRaw.message, "backend.message"),
    ...(token === undefined ? {} : { token }),
    ...(iconUrl === undefined ? {} : { iconUrl }),
    ...(fetchTimeoutMs === undefined ? {} : { fetchTimeoutMs }),
  };

  return {
    enabled,
    events,
    backend,
  };
}

export function loadConfigFromFile(filePath = DEFAULT_CONFIG_PATH): LoadedSmartNtfyConfig {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return parseSmartNtfyConfig(raw);
}
