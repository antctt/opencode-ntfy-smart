import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type {
  EventPermissionAsked,
  EventQuestionAsked,
  EventSessionCreated,
  EventSessionDeleted,
  EventSessionError,
  EventSessionIdle,
  EventSessionUpdated,
  PermissionRequest,
  QuestionRequest,
  Session,
} from "@opencode-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { LoadedSmartNtfyConfig, NotifyEvent } from "../src/config.js";
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
    iconUrl: "https://example.com/icon.png",
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

const sessionInfo = (overrides: Partial<Session> = {}): Session => ({
  id: "session-main",
  slug: "session-main",
  projectID: "project-demo",
  directory: "/tmp/demo",
  title: "Demo Session",
  version: "1",
  time: { created: 1, updated: 1 },
  ...overrides,
});

function createHarness(options?: {
  config?: LoadedSmartNtfyConfig;
  lookupSession?: Session | undefined;
}) {
  const send = vi.fn<
    (payload: { event: NotifyEvent; title: string; message: string; iconUrl?: string }) => Promise<void>
  >();
  const get = vi.fn(async () => ({ data: options?.lookupSession }));

  const client = {
    session: {
      get,
    },
  } as PluginInput["client"];

  const hooks = createSmartNtfyHooks({
    client,
    projectName: "demo",
    config: options?.config ?? baseConfig,
    $: undefined,
    send,
  });

  const emit = async (event: Parameters<NonNullable<Hooks["event"]>>[0]["event"]) => {
    if (!hooks.event) {
      throw new Error("Expected event hook to be defined");
    }

    await hooks.event({ event });
  };

  return { hooks, emit, send, get };
}

describe("createSmartNtfyHooks", () => {
  it("sends main session.idle", async () => {
    const harness = createHarness();
    const event: EventSessionIdle = {
      type: "session.idle",
      properties: { sessionID: "session-main" },
    };

    await harness.emit(event);

    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      event: "session.idle",
      title: "demo: idle",
      message: "idle",
      iconUrl: "https://example.com/icon.png",
    });
    expect(harness.get).toHaveBeenCalledOnce();
  });

  it("suppresses subagent session.idle from lifecycle cache and does not call get", async () => {
    const harness = createHarness();
    const created: EventSessionCreated = {
      type: "session.created",
      properties: {
        sessionID: "session-sub",
        info: sessionInfo({ id: "session-sub", parentID: "session-main" }),
      },
    };
    const event: EventSessionIdle = {
      type: "session.idle",
      properties: { sessionID: "session-sub" },
    };

    await harness.emit(created);
    await harness.emit(event);

    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.get).not.toHaveBeenCalled();
  });

  it("sends main session.error", async () => {
    const harness = createHarness();
    const event: EventSessionError = {
      type: "session.error",
      properties: {
        sessionID: "session-main",
        error: {
          name: "UnknownError",
          data: { message: "boom" },
        },
      },
    };

    await harness.emit(event);

    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      event: "session.error",
      title: "demo: error",
      message: "boom",
      iconUrl: "https://example.com/icon.png",
    });
    expect(harness.get).toHaveBeenCalledOnce();
  });

  it("suppresses subagent session.error via fallback lookup and calls get once", async () => {
    const harness = createHarness({
      lookupSession: sessionInfo({ id: "session-sub", parentID: "session-main" }),
    });
    const event: EventSessionError = {
      type: "session.error",
      properties: {
        sessionID: "session-sub",
        error: {
          name: "UnknownError",
          data: { message: "boom" },
        },
      },
    };

    await harness.emit(event);

    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.get).toHaveBeenCalledOnce();
    expect(harness.get).toHaveBeenCalledWith({ path: { id: "session-sub" } });
  });

  it("sends permission.asked for main sessions", async () => {
    const harness = createHarness();
    const request: PermissionRequest = {
      id: "perm-1",
      sessionID: "session-main",
      permission: "bash",
      patterns: ["src/**", "tests/**"],
      metadata: {},
      always: [],
    };
    const event: EventPermissionAsked = {
      type: "permission.asked",
      properties: request,
    };

    await harness.emit(event);

    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      event: "permission.asked",
      title: "demo: permission",
      message: "bash:src/**,tests/**",
      iconUrl: "https://example.com/icon.png",
    });
  });

  it("sends permission.asked for subagent sessions", async () => {
    const harness = createHarness();
    const updated: EventSessionUpdated = {
      type: "session.updated",
      properties: {
        sessionID: "session-sub",
        info: sessionInfo({ id: "session-sub", parentID: "session-main" }),
      },
    };
    const request: PermissionRequest = {
      id: "perm-1",
      sessionID: "session-sub",
      permission: "bash",
      patterns: ["src/**"],
      metadata: {},
      always: [],
    };
    const event: EventPermissionAsked = {
      type: "permission.asked",
      properties: request,
    };

    await harness.emit(updated);
    await harness.emit(event);

    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      event: "permission.asked",
      title: "demo: permission",
      message: "bash:src/**",
      iconUrl: "https://example.com/icon.png",
    });
    expect(harness.get).not.toHaveBeenCalled();
  });

  it("sends question.asked for main sessions using the first question prompt", async () => {
    const harness = createHarness();
    const request: QuestionRequest = {
      id: "question-1",
      sessionID: "session-main",
      questions: [
        {
          question: "Need approval?",
          header: "Approval",
          options: [
            { label: "Yes", description: "Approve" },
            { label: "No", description: "Reject" },
          ],
        },
        {
          question: "Ignored question",
          header: "Ignored",
          options: [],
        },
      ],
    };
    const event: EventQuestionAsked = {
      type: "question.asked",
      properties: request,
    };

    await harness.emit(event);

    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      event: "question.asked",
      title: "demo: question",
      message: "Need approval?",
      iconUrl: "https://example.com/icon.png",
    });
  });

  it("sends question.asked for subagent sessions", async () => {
    const harness = createHarness();
    const deleted: EventSessionDeleted = {
      type: "session.deleted",
      properties: {
        sessionID: "session-sub",
        info: sessionInfo({ id: "session-sub", parentID: "session-main" }),
      },
    };
    const updated: EventSessionUpdated = {
      type: "session.updated",
      properties: {
        sessionID: "session-sub",
        info: sessionInfo({ id: "session-sub", parentID: "session-main" }),
      },
    };
    const request: QuestionRequest = {
      id: "question-1",
      sessionID: "session-sub",
      questions: [
        {
          question: "Subagent needs input",
          header: "Subagent",
          options: [{ label: "OK", description: "Continue" }],
        },
      ],
    };
    const event: EventQuestionAsked = {
      type: "question.asked",
      properties: request,
    };

    await harness.emit(updated);
    await harness.emit(deleted);
    await harness.emit(updated);
    await harness.emit(event);

    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      event: "question.asked",
      title: "demo: question",
      message: "Subagent needs input",
      iconUrl: "https://example.com/icon.png",
    });
    expect(harness.get).not.toHaveBeenCalled();
  });
});
