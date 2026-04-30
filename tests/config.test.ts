import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_PATH,
  NOTIFY_EVENTS,
  loadConfigFromFile,
  parseSmartNtfyConfig,
} from "../src/config.js";

describe("parseSmartNtfyConfig", () => {
  it("fills in defaults for the minimal valid config", () => {
    const config = parseSmartNtfyConfig({
      backend: {
        topic: "demo-topic",
      },
    });

    expect(config.enabled).toBe(true);
    expect(config.backend.server).toBe("https://ntfy.sh");
    expect(config.backend.priority).toBe("default");
    expect(config.backend.topic).toBe("demo-topic");
    expect(config.backend.title).toEqual({});
    expect(config.backend.message).toEqual({});
    expect(config.events).toEqual(
      Object.fromEntries(NOTIFY_EVENTS.map((name) => [name, { enabled: true }])),
    );
  });

  it("uses the expected default config path", () => {
    expect(DEFAULT_CONFIG_PATH).toMatch(/\.config\/opencode\/notification-ntfy-smart\.json$/);
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

  it("rejects unexpected top-level, event, backend, and icon keys", () => {
    expect(() =>
      parseSmartNtfyConfig({
        extra: true,
        events: {
          "session.idle": { enabled: true },
        },
        backend: {
          topic: "demo-topic",
        },
      }),
    ).toThrow("extra is not allowed");

    expect(() =>
      parseSmartNtfyConfig({
        events: {
          unexpected: { enabled: true },
        },
        backend: {
          topic: "demo-topic",
        },
      }),
    ).toThrow("events.unexpected is not allowed");

    expect(() =>
      parseSmartNtfyConfig({
        backend: {
          topic: "demo-topic",
          extra: true,
        },
      }),
    ).toThrow("backend.extra is not allowed");

    expect(() =>
      parseSmartNtfyConfig({
        backend: {
          topic: "demo-topic",
          icon: {
            mode: "light",
            variant: {
              light: "https://example.com/light.png",
            },
            extra: true,
          },
        },
      }),
    ).toThrow("backend.icon.extra is not allowed");
  });

  it("rejects invalid fetchTimeout values", () => {
    expect(() =>
      parseSmartNtfyConfig({
        backend: {
          topic: "demo-topic",
          fetchTimeout: "P",
        },
      }),
    ).toThrow("Invalid ISO 8601 duration: P");
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
