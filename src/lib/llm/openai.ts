import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  AnalyzeCodegenInput,
  AnalyzeCodegenOutput,
  BusinessDiagramInput,
  BusinessDiagramOutput,
  LlmProvider,
  QaAuditInput,
  QaAuditOutput,
} from "@/lib/types";
import {
  ANALYZE_SYSTEM_PROMPT,
  BUSINESS_DIAGRAM_SYSTEM_PROMPT,
  QA_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildBusinessDiagramUserPrompt,
  buildQaUserPrompt,
} from "./prompts";
import { AnalyzeCodegenSchema, BusinessDiagramSchema, QaAuditSchema } from "./schemas";
import { OPENAI_MODEL_OPTIONS, defaultModelId } from "./models";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? defaultModelId(OPENAI_MODEL_OPTIONS);

function client(): OpenAI {
  return new OpenAI();
}

export class OpenAiProvider implements LlmProvider {
  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput> {
    const response = await client().responses.parse({
      model: this.model,
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
      model: this.model,
      instructions: QA_SYSTEM_PROMPT,
      input: buildQaUserPrompt(input.files, input.previousFailures),
      text: { format: zodTextFormat(QaAuditSchema, "qa_audit") },
    });
    if (!response.output_parsed) {
      throw new Error("ChatGPT가 QA 감사 결과를 구조화된 JSON으로 반환하지 못했습니다.");
    }
    return response.output_parsed;
  }

  async generateBusinessDiagram(input: BusinessDiagramInput): Promise<BusinessDiagramOutput> {
    const response = await client().responses.parse({
      model: this.model,
      instructions: BUSINESS_DIAGRAM_SYSTEM_PROMPT,
      input: buildBusinessDiagramUserPrompt(input),
      text: { format: zodTextFormat(BusinessDiagramSchema, "business_diagram") },
    });
    if (!response.output_parsed) {
      throw new Error("ChatGPT가 업무 다이어그램 결과를 구조화된 JSON으로 반환하지 못했습니다.");
    }
    return response.output_parsed;
  }
}
