import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PluginInput } from "@opencode-ai/plugin";
import { describe, expect, it } from "vitest";
import { resolveTemplate, renderTemplateValue } from "../src/templates.js";

const execFileAsync = promisify(execFile);

function createRealShell(): PluginInput["$"] {
  return ((strings: TemplateStringsArray, expression: { raw: string }) => ({
    nothrow() {
      return this;
    },
    quiet() {
      return this;
    },
    async then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        | ((value: { exitCode: number; text(): string }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      try {
        const result = await execFileAsync("sh", ["-lc", expression.raw]);
        return Promise.resolve(
          onfulfilled?.({
            exitCode: 0,
            text() {
              return result.stdout;
            },
          }) as TResult1,
        );
      } catch (error) {
        const execError = error as Error & {
          stdout?: string;
          stderr?: string;
          code?: number;
        };

        return Promise.resolve(
          onfulfilled?.({
            exitCode: execError.code ?? 1,
            text() {
              return execError.stdout ?? execError.stderr ?? "";
            },
          }) as TResult1,
        );
      }
    },
  })) as unknown as PluginInput["$"];
}

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

  it("throws when a command template is configured without an OpenCode shell", async () => {
    try {
      await resolveTemplate({ command: "printf {project}" }, "fallback", { project: "demo" });
      throw new Error("Expected resolveTemplate to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "Command template configured but no OpenCode shell was provided",
      );
    }
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
    ).resolves.toBe("stdout:printf 'demo'");
  });

  it("shell-quotes command template values so metacharacters stay literal", async () => {
    const shell = ((strings: TemplateStringsArray, expression: { raw: string }) => ({
      nothrow() {
        return this;
      },
      quiet() {
        return this;
      },
      exitCode: 0,
      text() {
        return expression.raw;
      },
    })) as unknown as PluginInput["$"];

    await expect(
      resolveTemplate(
        { command: "printf %s {question}" },
        "fallback",
        { question: "$(whoami); 'two words'" },
        shell,
      ),
    ).resolves.toBe("printf %s '$(whoami); '\\''two words'\\''' ".trim());
  });

  it("treats shell-sensitive values as literal data in a real shell", async () => {
    await expect(
      resolveTemplate(
        { command: "printf %s {question}" },
        "fallback",
        { question: "$(whoami); 'two words'" },
        createRealShell(),
      ),
    ).resolves.toBe("$(whoami); 'two words'");
  });

  it("trims successful command template output", async () => {
    const shell = ((strings: TemplateStringsArray, expression: { raw: string }) => ({
      nothrow() {
        return this;
      },
      quiet() {
        return this;
      },
      exitCode: 0,
      text() {
        return `  stdout:${expression.raw}\n`;
      },
    })) as unknown as PluginInput["$"];

    await expect(
      resolveTemplate({ command: "printf {project}" }, "fallback", { project: "demo" }, shell),
    ).resolves.toBe("stdout:printf 'demo'");
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

    try {
      await resolveTemplate({ command: "printf demo" }, "fallback", { project: "demo" }, shell);
      throw new Error("Expected resolveTemplate to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "Command template failed with exit code 1: printf demo",
      );
    }
  });
});
