import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  AnalyzeCodegenInput,
  AnalyzeCodegenOutput,
  LlmProvider,
  QaAuditInput,
  QaAuditOutput,
} from "@/lib/types";
import {
  ANALYZE_SYSTEM_PROMPT,
  QA_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildQaUserPrompt,
} from "./prompts";
import { AnalyzeCodegenSchema, QaAuditSchema } from "./schemas";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

function client(): Anthropic {
  return new Anthropic();
}

export class ClaudeProvider implements LlmProvider {
  async analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput> {
    const response = await client().messages.parse({
      model: MODEL,
      max_tokens: 32000,
      system: ANALYZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAnalyzeUserPrompt(input) }],
      output_config: { format: zodOutputFormat(AnalyzeCodegenSchema) },
    });
    if (!response.parsed_output) {
      throw new Error("Claude가 분석 결과를 구조화된 JSON으로 반환하지 못했습니다.");
    }
    return response.parsed_output;
  }

  async runQaAudit(input: QaAuditInput): Promise<QaAuditOutput> {
    const response = await client().messages.parse({
      model: MODEL,
      max_tokens: 32000,
      system: QA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildQaUserPrompt(input.files) }],
      output_config: { format: zodOutputFormat(QaAuditSchema) },
    });
    if (!response.parsed_output) {
      throw new Error("Claude가 QA 감사 결과를 구조화된 JSON으로 반환하지 못했습니다.");
    }
    return response.parsed_output;
  }
}
