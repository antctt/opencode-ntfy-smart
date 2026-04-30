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
