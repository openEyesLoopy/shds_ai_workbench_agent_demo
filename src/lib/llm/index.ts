import type { LlmProvider, LlmProviderName, WorkbenchSettings } from "@/lib/types";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { OpenAiProvider } from "./openai";

/**
 * `models` lets the caller pin a specific model tier per provider (from
 * settings) to control token cost — omit a field, or the whole argument, to
 * fall back to each provider's own env-configured default.
 */
export function getLlmProvider(
  name: LlmProviderName,
  models?: Pick<WorkbenchSettings, "claudeModel" | "geminiModel" | "openaiModel">
): LlmProvider {
  switch (name) {
    case "claude":
      return models?.claudeModel ? new ClaudeProvider(models.claudeModel) : new ClaudeProvider();
    case "gemini":
      return models?.geminiModel ? new GeminiProvider(models.geminiModel) : new GeminiProvider();
    case "openai":
      return models?.openaiModel ? new OpenAiProvider(models.openaiModel) : new OpenAiProvider();
    default:
      throw new Error(`알 수 없는 LLM 제공자입니다: ${name}`);
  }
}

export type { LlmProvider } from "@/lib/types";
