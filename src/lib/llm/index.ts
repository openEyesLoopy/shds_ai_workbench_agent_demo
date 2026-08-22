import type { LlmProvider, LlmProviderName } from "@/lib/types";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { OpenAiProvider } from "./openai";

export function getLlmProvider(name: LlmProviderName): LlmProvider {
  switch (name) {
    case "claude":
      return new ClaudeProvider();
    case "gemini":
      return new GeminiProvider();
    case "openai":
      return new OpenAiProvider();
    default:
      throw new Error(`알 수 없는 LLM 제공자입니다: ${name}`);
  }
}

export type { LlmProvider } from "@/lib/types";
