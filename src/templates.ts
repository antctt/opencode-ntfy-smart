import type { PluginInput } from "@opencode-ai/plugin";
import type { ContentTemplate } from "./config.js";

export type TemplateVariables = Record<string, string>;

function quoteShellValue(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function renderCommandTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => quoteShellValue(variables[key] ?? ""));
}

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

  const command = renderCommandTemplate(template.command, variables);
  const result = await $`${{ raw: command }}`.nothrow().quiet();
  const output = result.text().trim();

  if (result.exitCode !== 0) {
    throw new Error(`Command template failed with exit code ${result.exitCode}: ${command}`);
  }

  return output;
}
