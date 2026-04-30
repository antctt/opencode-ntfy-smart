# opencode-ntfy-smart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publishable standalone OpenCode plugin that sends `ntfy.sh` iPhone notifications with the exact approved main/subagent policy: main sessions notify for all four events, while subagents notify only for `permission.asked` and `question.asked`.

**Architecture:** Implement a small TypeScript package with focused modules for config loading, template rendering, direct `ntfy.sh` delivery, and the OpenCode plugin entrypoint. The plugin owns event policy directly, caches session kind from lifecycle events, falls back to `client.session.get()` when needed, and swallows notification-path failures so OpenCode keeps running.

**Tech Stack:** TypeScript, Node 20+, `@opencode-ai/plugin` types, native `fetch`, `iso8601-duration`, Vitest

---

## File Map

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `notification-ntfy-smart.schema.json`
- Create: `src/index.ts`
- Create: `src/config.ts`
- Create: `src/templates.ts`
- Create: `src/ntfy.ts`
- Create: `tests/index.test.ts`
- Create: `tests/config.test.ts`
- Create: `tests/templates.test.ts`
- Create: `tests/ntfy.test.ts`

## Behavior Checklist

- Main `session.idle` sends
- Subagent `session.idle` suppresses
- Main `session.error` sends
- Subagent `session.error` suppresses
- Main `permission.asked` sends
- Subagent `permission.asked` sends
- Main `question.asked` sends
- Subagent `question.asked` sends
- `{question}` resolves from `properties.questions[0].question` or `""`
- Config file path is `~/.config/opencode/notification-ntfy-smart.json`
- Local OpenCode usage points to `/root/code/opencode-ntfy-smart/dist/index.js`

### Task 1: Bootstrap The Package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Create the package/tooling scaffold**

```json
{
  "name": "opencode-ntfy-smart",
  "version": "0.1.0",
  "description": "OpenCode plugin that sends ntfy.sh notifications with smart main/subagent filtering",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "notification-ntfy-smart.schema.json",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/antctt/opencode-ntfy-smart.git"
  },
  "homepage": "https://github.com/antctt/opencode-ntfy-smart#readme",
  "bugs": "https://github.com/antctt/opencode-ntfy-smart/issues",
  "keywords": [
    "opencode",
    "opencode-plugin",
    "ntfy",
    "ntfy.sh",
    "notifications",
    "iphone",
    "push"
  ],
  "author": "antctt",
  "license": "MIT",
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  },
  "dependencies": {
    "iso8601-duration": "^2.1.3"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.2.6",
    "@types/node": "^25.2.3",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

```gitignore
node_modules/
dist/
coverage/
*.tgz
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: install finishes successfully and creates `package-lock.json`

- [ ] **Step 3: Write the failing plugin smoke test**

```ts
import { describe, expect, it } from "vitest";
import plugin from "../src/index.js";

describe("plugin entry", () => {
  it("returns hooks with an event handler", async () => {
    const hooks = await plugin({
      client: { session: { get: async () => ({ data: undefined }) } } as never,
      project: {} as never,
      directory: "/tmp/demo",
      worktree: "/tmp/demo",
      experimental_workspace: { register() {} },
      serverUrl: new URL("http://127.0.0.1:4096"),
      $: undefined as never,
    });

    expect(typeof hooks.event).toBe("function");
  });
});
```

- [ ] **Step 4: Run the smoke test and confirm red**

Run: `npm test -- tests/index.test.ts`
Expected: FAIL because `src/index.ts` does not exist yet.

- [ ] **Step 5: Add the minimal plugin entry point**

```ts
import type { Plugin } from "@opencode-ai/plugin";

const plugin: Plugin = async () => {
  return {
    event: async () => undefined,
  };
};

export default plugin;
```

- [ ] **Step 6: Re-run the smoke test and confirm green**

Run: `npm test -- tests/index.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the scaffold**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/index.ts tests/index.test.ts
git commit -m "chore: scaffold opencode ntfy smart plugin"
```

### Task 2: Add Config Loading And Schema Validation

**Files:**
- Create: `src/config.ts`
- Create: `notification-ntfy-smart.schema.json`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing config tests**

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile, parseSmartNtfyConfig } from "../src/config.js";

describe("parseSmartNtfyConfig", () => {
  it("fills defaults for optional fields", () => {
    const config = parseSmartNtfyConfig({
      backend: {
        topic: "demo-topic",
      },
    });

    expect(config.enabled).toBe(true);
    expect(config.backend.server).toBe("https://ntfy.sh");
    expect(config.backend.priority).toBe("default");
    expect(config.events["session.idle"].enabled).toBe(true);
    expect(config.events["question.asked"].enabled).toBe(true);
  });

  it("selects the icon variant that matches the configured mode", () => {
    const config = parseSmartNtfyConfig({
      backend: {
        topic: "demo-topic",
        icon: {
          mode: "light",
          variant: {
            light: "https://example.com/light.png",
            dark: "https://example.com/dark.png",
          },
        },
      },
    });

    expect(config.backend.iconUrl).toBe("https://example.com/light.png");
  });

  it("rejects invalid priorities", () => {
    expect(() =>
      parseSmartNtfyConfig({
        backend: {
          topic: "demo-topic",
          priority: "urgent",
        },
      }),
    ).toThrow("backend.priority must be one of");
  });

  it("rejects templates with both value and command", () => {
    expect(() =>
      parseSmartNtfyConfig({
        backend: {
          topic: "demo-topic",
          title: {
            "session.idle": {
              value: "hello",
              command: "printf hello",
            },
          },
        },
      }),
    ).toThrow("backend.title.session.idle");
  });
});

describe("loadConfigFromFile", () => {
  it("reads config from disk", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "opencode-ntfy-smart-"));
    const filePath = join(tempDir, "notification-ntfy-smart.json");

    try {
      writeFileSync(
        filePath,
        JSON.stringify({
          backend: {
            topic: "demo-topic",
          },
        }),
      );

      expect(loadConfigFromFile(filePath).backend.topic).toBe("demo-topic");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the config tests and confirm red**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL because `src/config.ts` does not exist yet.

- [ ] **Step 3: Implement the config loader**

```ts
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!isRecord(raw)) {
    return undefined;
  }

  const mode = raw.mode === "light" ? "light" : "dark";
  const variant = isRecord(raw.variant) ? raw.variant : {};
  const candidate = mode === "light" ? variant.light : variant.dark;

  return typeof candidate === "string" && candidate.trim() !== "" ? candidate : undefined;
}

export function parseSmartNtfyConfig(raw: unknown): LoadedSmartNtfyConfig {
  if (!isRecord(raw)) {
    throw new Error("notification-ntfy-smart.json must contain a JSON object");
  }

  const eventsRaw = isRecord(raw.events) ? raw.events : {};
  const events = Object.fromEntries(
    NOTIFY_EVENTS.map((name) => {
      const entry = isRecord(eventsRaw[name]) ? eventsRaw[name] : {};
      const enabled = typeof entry.enabled === "boolean" ? entry.enabled : true;
      return [name, { enabled }];
    }),
  ) as Record<NotifyEvent, EventToggle>;

  const backendRaw = raw.backend;
  if (!isRecord(backendRaw)) {
    throw new Error("backend must be an object");
  }

  if (typeof backendRaw.topic !== "string" || backendRaw.topic.trim() === "") {
    throw new Error("backend.topic must be a non-empty string");
  }

  const priority = typeof backendRaw.priority === "string" ? backendRaw.priority : "default";
  if (!VALID_PRIORITIES.includes(priority as NtfyPriority)) {
    throw new Error(`backend.priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    events,
    backend: {
      topic: backendRaw.topic,
      server: typeof backendRaw.server === "string" ? backendRaw.server : "https://ntfy.sh",
      token: typeof backendRaw.token === "string" ? backendRaw.token : undefined,
      priority: priority as NtfyPriority,
      iconUrl: resolveIconUrl(backendRaw.icon),
      fetchTimeoutMs:
        typeof backendRaw.fetchTimeout === "string"
          ? parseDurationToMs(backendRaw.fetchTimeout)
          : undefined,
      title: parseTemplateMap(backendRaw.title, "backend.title"),
      message: parseTemplateMap(backendRaw.message, "backend.message"),
    },
  };
}

export function loadConfigFromFile(filePath = DEFAULT_CONFIG_PATH): LoadedSmartNtfyConfig {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return parseSmartNtfyConfig(raw);
}
```

- [ ] **Step 4: Add the JSON schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://raw.githubusercontent.com/antctt/opencode-ntfy-smart/main/notification-ntfy-smart.schema.json",
  "title": "opencode-ntfy-smart Configuration",
  "description": "Configuration for ~/.config/opencode/notification-ntfy-smart.json",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "$schema": {
      "type": "string"
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "events": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "session.idle": { "$ref": "#/$defs/eventToggle" },
        "session.error": { "$ref": "#/$defs/eventToggle" },
        "permission.asked": { "$ref": "#/$defs/eventToggle" },
        "question.asked": { "$ref": "#/$defs/eventToggle" }
      }
    },
    "backend": {
      "type": "object",
      "required": ["topic"],
      "additionalProperties": false,
      "properties": {
        "topic": {
          "type": "string",
          "minLength": 1
        },
        "server": {
          "type": "string",
          "default": "https://ntfy.sh"
        },
        "token": {
          "type": "string"
        },
        "priority": {
          "type": "string",
          "enum": ["min", "low", "default", "high", "max"],
          "default": "default"
        },
        "icon": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "mode": {
              "type": "string",
              "enum": ["light", "dark"],
              "default": "dark"
            },
            "variant": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "light": { "type": "string" },
                "dark": { "type": "string" }
              }
            }
          }
        },
        "fetchTimeout": {
          "type": "string",
          "pattern": "^P"
        },
        "title": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "session.idle": { "$ref": "#/$defs/contentTemplate" },
            "session.error": { "$ref": "#/$defs/contentTemplate" },
            "permission.asked": { "$ref": "#/$defs/contentTemplate" },
            "question.asked": { "$ref": "#/$defs/contentTemplate" }
          }
        },
        "message": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "session.idle": { "$ref": "#/$defs/contentTemplate" },
            "session.error": { "$ref": "#/$defs/contentTemplate" },
            "permission.asked": { "$ref": "#/$defs/contentTemplate" },
            "question.asked": { "$ref": "#/$defs/contentTemplate" }
          }
        }
      }
    }
  },
  "$defs": {
    "eventToggle": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "contentTemplate": {
      "type": "object",
      "additionalProperties": false,
      "oneOf": [
        {
          "required": ["value"],
          "properties": {
            "value": { "type": "string" }
          }
        },
        {
          "required": ["command"],
          "properties": {
            "command": { "type": "string" }
          }
        }
      ]
    }
  }
}
```

- [ ] **Step 5: Re-run the config tests and confirm green**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the config layer**

```bash
git add src/config.ts notification-ntfy-smart.schema.json tests/config.test.ts
git commit -m "feat: add ntfy smart config loader"
```

### Task 3: Add Template Rendering

**Files:**
- Create: `src/templates.ts`
- Create: `tests/templates.test.ts`

- [ ] **Step 1: Write the failing template tests**

```ts
import type { PluginInput } from "@opencode-ai/plugin";
import { describe, expect, it } from "vitest";
import { resolveTemplate, renderTemplateValue } from "../src/templates.js";

describe("renderTemplateValue", () => {
  it("substitutes known placeholders and blanks unknown ones", () => {
    expect(
      renderTemplateValue("{project}:{session_id}:{missing}", {
        project: "demo",
        session_id: "session-1",
      }),
    ).toBe("demo:session-1:");
  });
});

describe("resolveTemplate", () => {
  it("returns the fallback when no template is configured", async () => {
    await expect(resolveTemplate(undefined, "fallback", { project: "demo" })).resolves.toBe(
      "fallback",
    );
  });

  it("renders value templates", async () => {
    await expect(
      resolveTemplate(
        { value: "Need input for {project}" },
        "fallback",
        { project: "demo" },
      ),
    ).resolves.toBe("Need input for demo");
  });

  it("executes command templates through the OpenCode shell", async () => {
    const shell = ((strings: TemplateStringsArray, expression: { raw: string }) => ({
      nothrow() {
        return this;
      },
      quiet() {
        return this;
      },
      exitCode: 0,
      text() {
        return `stdout:${expression.raw}`;
      },
    })) as unknown as PluginInput["$"];

    await expect(
      resolveTemplate({ command: "printf {project}" }, "fallback", { project: "demo" }, shell),
    ).resolves.toBe("stdout:printf demo");
  });

  it("throws when a command template exits non-zero", async () => {
    const shell = (() => ({
      nothrow() {
        return this;
      },
      quiet() {
        return this;
      },
      exitCode: 1,
      text() {
        return "boom";
      },
    })) as unknown as PluginInput["$"];

    await expect(
      resolveTemplate({ command: "printf demo" }, "fallback", { project: "demo" }, shell),
    ).rejects.toThrow("Command template failed");
  });
});
```

- [ ] **Step 2: Run the template tests and confirm red**

Run: `npm test -- tests/templates.test.ts`
Expected: FAIL because `src/templates.ts` does not exist yet.

- [ ] **Step 3: Implement template rendering and command execution**

```ts
import type { PluginInput } from "@opencode-ai/plugin";
import type { ContentTemplate } from "./config.js";

export type TemplateVariables = Record<string, string>;

export function renderTemplateValue(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => variables[key] ?? "");
}

export async function resolveTemplate(
  template: ContentTemplate | undefined,
  fallback: string,
  variables: TemplateVariables,
  $?: PluginInput["$"],
): Promise<string> {
  if (!template) {
    return fallback;
  }

  if ("value" in template) {
    return renderTemplateValue(template.value, variables);
  }

  if (!$) {
    throw new Error("Command template configured but no OpenCode shell was provided");
  }

  const command = renderTemplateValue(template.command, variables);
  const result = await $`${{ raw: command }}`.nothrow().quiet();
  const output = result.text().trim();

  if (result.exitCode !== 0) {
    throw new Error(`Command template failed with exit code ${result.exitCode}: ${command}`);
  }

  return output;
}
```

- [ ] **Step 4: Re-run the template tests and confirm green**

Run: `npm test -- tests/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the template layer**

```bash
git add src/templates.ts tests/templates.test.ts
git commit -m "feat: add smart ntfy template rendering"
```

### Task 4: Add Direct ntfy Delivery

**Files:**
- Create: `src/ntfy.ts`
- Create: `tests/ntfy.test.ts`

- [ ] **Step 1: Write the failing ntfy transport tests**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedBackendConfig } from "../src/config.js";
import { sendNtfyNotification } from "../src/ntfy.js";

const baseBackend: LoadedBackendConfig = {
  topic: "demo-topic",
  server: "https://ntfy.sh",
  priority: "default",
  title: {},
  message: {},
};

describe("sendNtfyNotification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the expected payload to ntfy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });

    vi.stubGlobal("fetch", fetchMock);

    await sendNtfyNotification(
      {
        ...baseBackend,
        token: "secret-token",
        fetchTimeoutMs: 1000,
      },
      {
        event: "question.asked",
        title: "Need input",
        message: "Please answer the question",
        iconUrl: "https://example.com/icon.png",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.sh/demo-topic");
    expect(options).toMatchObject({
      method: "POST",
      body: "Please answer the question",
      headers: expect.objectContaining({
        Title: "Need input",
        Priority: "default",
        Tags: "question",
        Icon: "https://example.com/icon.png",
        Authorization: "Bearer secret-token",
      }),
    });
    expect(options.signal).toBeDefined();
  });

  it("throws when ntfy responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(
      sendNtfyNotification(baseBackend, {
        event: "session.error",
        title: "Agent Error",
        message: "boom",
      }),
    ).rejects.toThrow("ntfy request failed: 500 Internal Server Error");
  });
});
```

- [ ] **Step 2: Run the ntfy transport tests and confirm red**

Run: `npm test -- tests/ntfy.test.ts`
Expected: FAIL because `src/ntfy.ts` does not exist yet.

- [ ] **Step 3: Implement the ntfy sender**

```ts
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
    ...(backend.fetchTimeoutMs
      ? { signal: AbortSignal.timeout(backend.fetchTimeoutMs) }
      : {}),
  });

  if (!response.ok) {
    throw new Error(`ntfy request failed: ${response.status} ${response.statusText}`);
  }
}
```

- [ ] **Step 4: Re-run the ntfy transport tests and confirm green**

Run: `npm test -- tests/ntfy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the transport layer**

```bash
git add src/ntfy.ts tests/ntfy.test.ts
git commit -m "feat: add direct ntfy delivery"
```

### Task 5: Implement Session Classification And Event Policy

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Replace the smoke test with the full policy regression suite**

```ts
import type { PluginInput } from "@opencode-ai/plugin";
import { describe, expect, it, vi } from "vitest";
import type { LoadedSmartNtfyConfig } from "../src/config.js";
import { createSmartNtfyHooks } from "../src/index.js";

const baseConfig: LoadedSmartNtfyConfig = {
  enabled: true,
  events: {
    "session.idle": { enabled: true },
    "session.error": { enabled: true },
    "permission.asked": { enabled: true },
    "question.asked": { enabled: true },
  },
  backend: {
    topic: "demo-topic",
    server: "https://ntfy.sh",
    priority: "default",
    title: {
      "session.idle": { value: "{project}: idle" },
      "session.error": { value: "{project}: error" },
      "permission.asked": { value: "{project}: permission" },
      "question.asked": { value: "{project}: question" },
    },
    message: {
      "session.idle": { value: "idle" },
      "session.error": { value: "{error}" },
      "permission.asked": { value: "{permission_type}:{permission_patterns}" },
      "question.asked": { value: "{question}" },
    },
  },
};

function sessionInfo(id: string, parentID?: string) {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory: "/tmp/demo",
    title: id,
    version: "1",
    time: { created: 0, updated: 0 },
    ...(parentID ? { parentID } : {}),
  };
}

function createHarness(
  sessionLookup: Record<string, { parentID?: string } | undefined> = {},
  config: LoadedSmartNtfyConfig = baseConfig,
) {
  const sent: Array<{ event: string; title: string; message: string; iconUrl?: string }> = [];
  const get = vi.fn(async ({ path: { id } }: { path: { id: string } }) => ({
    data: sessionLookup[id],
  }));

  const hooks = createSmartNtfyHooks({
    client: { session: { get } } as unknown as PluginInput["client"],
    projectName: "demo",
    config,
    $: undefined as never,
    send: async (payload) => {
      sent.push(payload);
    },
  });

  return {
    onEvent: hooks.event!,
    sent,
    get,
  };
}

describe("createSmartNtfyHooks", () => {
  it("sends main session.idle notifications", async () => {
    const harness = createHarness({ "main-1": {} });

    await harness.onEvent({
      event: {
        type: "session.idle",
        properties: { sessionID: "main-1" },
      },
    });

    expect(harness.sent).toEqual([
      {
        event: "session.idle",
        title: "demo: idle",
        message: "idle",
        iconUrl: undefined,
      },
    ]);
  });

  it("suppresses subagent session.idle notifications from the lifecycle cache", async () => {
    const harness = createHarness();

    await harness.onEvent({
      event: {
        type: "session.created",
        properties: {
          sessionID: "child-1",
          info: sessionInfo("child-1", "main-1"),
        },
      } as never,
    });

    await harness.onEvent({
      event: {
        type: "session.idle",
        properties: { sessionID: "child-1" },
      },
    });

    expect(harness.sent).toHaveLength(0);
    expect(harness.get).not.toHaveBeenCalled();
  });

  it("sends main session.error notifications", async () => {
    const harness = createHarness({ "main-2": {} });

    await harness.onEvent({
      event: {
        type: "session.error",
        properties: {
          sessionID: "main-2",
          error: {
            name: "UnknownError",
            data: { message: "boom" },
          },
        },
      } as never,
    });

    expect(harness.sent).toEqual([
      {
        event: "session.error",
        title: "demo: error",
        message: "boom",
        iconUrl: undefined,
      },
    ]);
  });

  it("suppresses subagent session.error notifications via fallback lookup", async () => {
    const harness = createHarness({ "child-2": { parentID: "main-2" } });

    await harness.onEvent({
      event: {
        type: "session.error",
        properties: {
          sessionID: "child-2",
          error: {
            name: "UnknownError",
            data: { message: "boom" },
          },
        },
      } as never,
    });

    expect(harness.sent).toHaveLength(0);
    expect(harness.get).toHaveBeenCalledTimes(1);
  });

  it("sends permission.asked for main sessions", async () => {
    const harness = createHarness({ "main-3": {} });

    await harness.onEvent({
      event: {
        type: "permission.asked",
        properties: {
          id: "perm-1",
          sessionID: "main-3",
          permission: "bash",
          patterns: ["src/index.ts", "package.json"],
          metadata: {},
          always: [],
        },
      } as never,
    });

    expect(harness.sent).toEqual([
      {
        event: "permission.asked",
        title: "demo: permission",
        message: "bash:src/index.ts,package.json",
        iconUrl: undefined,
      },
    ]);
  });

  it("sends permission.asked for subagent sessions", async () => {
    const harness = createHarness({ "child-3": { parentID: "main-3" } });

    await harness.onEvent({
      event: {
        type: "permission.asked",
        properties: {
          id: "perm-2",
          sessionID: "child-3",
          permission: "edit",
          patterns: ["README.md"],
          metadata: {},
          always: [],
        },
      } as never,
    });

    expect(harness.sent).toEqual([
      {
        event: "permission.asked",
        title: "demo: permission",
        message: "edit:README.md",
        iconUrl: undefined,
      },
    ]);
  });

  it("sends question.asked for main sessions using the first question prompt", async () => {
    const harness = createHarness({ "main-4": {} });

    await harness.onEvent({
      event: {
        type: "question.asked",
        properties: {
          id: "question-1",
          sessionID: "main-4",
          questions: [
            {
              question: "Ship it?",
              header: "Ship",
              options: [{ label: "Yes", description: "Ship it" }],
            },
          ],
        },
      } as never,
    });

    expect(harness.sent).toEqual([
      {
        event: "question.asked",
        title: "demo: question",
        message: "Ship it?",
        iconUrl: undefined,
      },
    ]);
  });

  it("sends question.asked for subagent sessions", async () => {
    const harness = createHarness({ "child-4": { parentID: "main-4" } });

    await harness.onEvent({
      event: {
        type: "question.asked",
        properties: {
          id: "question-2",
          sessionID: "child-4",
          questions: [
            {
              question: "Need approval?",
              header: "Approval",
              options: [{ label: "Yes", description: "Approve" }],
            },
          ],
        },
      } as never,
    });

    expect(harness.sent).toEqual([
      {
        event: "question.asked",
        title: "demo: question",
        message: "Need approval?",
        iconUrl: undefined,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the policy tests and confirm red**

Run: `npm test -- tests/index.test.ts`
Expected: FAIL because `src/index.ts` still contains only the smoke implementation.

- [ ] **Step 3: Replace `src/index.ts` with the full plugin implementation**

```ts
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

function getNotificationEvent(event: RuntimeEvent): NotifyEvent | null {
  switch (event.type) {
    case "session.idle":
    case "session.error":
    case "permission.asked":
    case "question.asked":
      return event.type;
    default:
      return null;
  }
}

function getSessionID(event: RuntimeEvent): string | undefined {
  switch (event.type) {
    case "session.idle":
      return event.properties.sessionID;
    case "session.error":
      return event.properties.sessionID;
    case "permission.asked":
      return event.properties.sessionID;
    case "question.asked":
      return event.properties.sessionID;
    default:
      return undefined;
  }
}

function getErrorMessage(error: unknown): string {
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

function rememberSession(
  cache: Map<string, SessionKind>,
  sessionID: string,
  info: { id?: string | null; parentID?: string | null },
): void {
  const id = typeof info.id === "string" && info.id !== "" ? info.id : sessionID;
  cache.set(id, info.parentID ? "subagent" : "main");
}

async function classifySession(
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
    const sessionKind: SessionKind = response.data?.parentID ? "subagent" : "main";
    cache.set(sessionID, sessionKind);
    return sessionKind;
  } catch {
    return "main";
  }
}

export function buildTemplateVariables(
  projectName: string,
  event: Extract<RuntimeEvent, { type: NotifyEvent }>,
): TemplateVariables {
  switch (event.type) {
    case "session.idle":
      return {
        project: projectName,
        session_id: event.properties.sessionID,
        error: "",
        permission_type: "",
        permission_patterns: "",
        question: "",
      };
    case "session.error":
      return {
        project: projectName,
        session_id: event.properties.sessionID ?? "",
        error: getErrorMessage(event.properties.error),
        permission_type: "",
        permission_patterns: "",
        question: "",
      };
    case "permission.asked":
      return {
        project: projectName,
        session_id: event.properties.sessionID,
        error: "",
        permission_type: event.properties.permission,
        permission_patterns: event.properties.patterns.join(","),
        question: "",
      };
    case "question.asked":
      return {
        project: projectName,
        session_id: event.properties.sessionID,
        error: "",
        permission_type: "",
        permission_patterns: "",
        question: event.properties.questions[0]?.question ?? "",
      };
  }
}

export function createSmartNtfyHooks(input: {
  client: PluginInput["client"];
  projectName: string;
  config: LoadedSmartNtfyConfig;
  $: PluginInput["$"];
  send: (payload: {
    event: NotifyEvent;
    title: string;
    message: string;
    iconUrl?: string;
  }) => Promise<void>;
}): Hooks {
  const sessionKinds = new Map<string, SessionKind>();

  return {
    event: async ({ event }) => {
      if (event.type === "session.created" || event.type === "session.updated") {
        rememberSession(sessionKinds, event.properties.sessionID, event.properties.info);
        return;
      }

      if (event.type === "session.deleted") {
        const id =
          typeof event.properties.info.id === "string" && event.properties.info.id !== ""
            ? event.properties.info.id
            : event.properties.sessionID;
        sessionKinds.delete(id);
        return;
      }

      const notificationEvent = getNotificationEvent(event);
      if (!notificationEvent) {
        return;
      }

      if (!input.config.enabled || !input.config.events[notificationEvent].enabled) {
        return;
      }

      const sessionKind = await classifySession(
        input.client,
        sessionKinds,
        getSessionID(event),
      );

      if (!NOTIFY_POLICY[notificationEvent][sessionKind]) {
        return;
      }

      try {
        const variables = buildTemplateVariables(input.projectName, event);
        const title = await resolveTemplate(
          input.config.backend.title[notificationEvent],
          DEFAULT_TITLES[notificationEvent],
          variables,
          input.$,
        );
        const message = await resolveTemplate(
          input.config.backend.message[notificationEvent],
          DEFAULT_MESSAGES[notificationEvent],
          variables,
          input.$,
        );

        await input.send({
          event: notificationEvent,
          title,
          message,
          iconUrl: input.config.backend.iconUrl,
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
      await sendNtfyNotification(config.backend, payload);
    },
  });
};

export default plugin;
```

- [ ] **Step 4: Re-run the policy tests and confirm green**

Run: `npm test -- tests/index.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite after the event-policy integration**

Run: `npm test`
Expected: PASS with 4 passing test files and 0 failures.

- [ ] **Step 6: Commit the plugin behavior**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add smart main and subagent notification policy"
```

### Task 6: Write README And Prepare The First Release

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add the package README**

```md
# opencode-ntfy-smart

`opencode-ntfy-smart` is a standalone OpenCode plugin that sends push notifications through `ntfy.sh`.

It keeps the current four notification events but changes session behavior so only the useful subagent alerts remain:

| Event | Main session | Subagent |
| --- | --- | --- |
| `session.idle` | notify | suppress |
| `session.error` | notify | suppress |
| `permission.asked` | notify | notify |
| `question.asked` | notify | notify |

## Install

```bash
npm install opencode-ntfy-smart
```

## Local development

```bash
npm install
npm run build
```

Point OpenCode at the local build:

```json
{
  "plugin": [
    "/root/code/opencode-ntfy-smart/dist/index.js"
  ]
}
```

## Configuration

Create `~/.config/opencode/notification-ntfy-smart.json`.

```json
{
  "$schema": "https://raw.githubusercontent.com/antctt/opencode-ntfy-smart/main/notification-ntfy-smart.schema.json",
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true },
    "question.asked": { "enabled": true }
  },
  "backend": {
    "topic": "opencode-example-topic",
    "server": "https://ntfy.sh",
    "priority": "default",
    "title": {
      "session.idle": { "value": "{project}: opencode finished" },
      "session.error": { "value": "{project}: opencode error" },
      "permission.asked": { "value": "{project}: permission needed" },
      "question.asked": { "value": "{project}: response needed" }
    },
    "message": {
      "session.idle": { "value": "The agent finished and is waiting for input." },
      "session.error": { "value": "{error}" },
      "permission.asked": { "value": "Permission requested: {permission_type} {permission_patterns}" },
      "question.asked": { "value": "{question}" }
    }
  }
}
```

## Publish

After tests and build pass:

```bash
npm pack
npm publish
```
```

- [ ] **Step 2: Run the full test suite again before building**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Build the package**

Run: `npm run build`
Expected: PASS and `dist/index.js`, `dist/index.d.ts`, `dist/config.js`, `dist/templates.js`, and `dist/ntfy.js` are created.

- [ ] **Step 4: Verify the package contents**

Run: `npm pack --json`
Expected: output contains one tarball entry for `opencode-ntfy-smart-0.1.0.tgz`.

- [ ] **Step 5: Initialize git, commit the release candidate, and create the GitHub repo**

```bash
git init && git add . && git commit -m "feat: add opencode ntfy smart plugin" && gh repo create antctt/opencode-ntfy-smart --source . --public --push
```
```

- [ ] **Step 6: Verify npm authentication before publishing**

Run: `npm whoami`
Expected: your npm username prints. If this fails with auth errors, authenticate before continuing.

- [ ] **Step 7: Publish the first version**

Run: `npm publish`
Expected: PASS and `opencode-ntfy-smart@0.1.0` is published.

## Self-Review Checklist

- Spec coverage:
  - standalone package, direct ntfy transport, fixed policy, config file rename, first-question placeholder, fallback `session.get()`, local plugin path, and publishability are all covered in Tasks 1-6.
- Placeholder scan:
  - no `TODO`, `TBD`, or "similar to" references remain.
- Type consistency:
  - `NotifyEvent`, `LoadedSmartNtfyConfig`, `ContentTemplate`, `TemplateVariables`, and the runtime event shapes are named consistently across all tasks.
