import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
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

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

function client(): OpenAI {
  return new OpenAI();
}

export class OpenAiProvider implements LlmProvider {
  async analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput> {
    const response = await client().responses.parse({
      model: MODEL,
      instructions: ANALYZE_SYSTEM_PROMPT,
      input: buildAnalyzeUserPrompt(input),
      text: { format: zodTextFormat(AnalyzeCodegenSchema, "analyze_codegen") },
    });
    if (!response.output_parsed) {
      throw new Error("ChatGPT가 분석 결과를 구조화된 JSON으로 반환하지 못했습니다.");
    }
    return response.output_parsed;
  }

  async runQaAudit(input: QaAuditInput): Promise<QaAuditOutput> {
    const response = await client().responses.parse({
      model: MODEL,
      instructions: QA_SYSTEM_PROMPT,
      input: buildQaUserPrompt(input.files, input.previousFailures),
      text: { format: zodTextFormat(QaAuditSchema, "qa_audit") },
    });
    if (!response.output_parsed) {
      throw new Error("ChatGPT가 QA 감사 결과를 구조화된 JSON으로 반환하지 못했습니다.");
    }
    return response.output_parsed;
  }
}
