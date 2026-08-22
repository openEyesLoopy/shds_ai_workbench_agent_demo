import { GoogleGenAI } from "@google/genai";
import type {
  AnalyzeCodegenInput,
  AnalyzeCodegenOutput,
  LlmProvider,
  QaAuditInput,
  QaAuditOutput,
} from "@/lib/types";
import {
  ANALYZE_JSON_SCHEMA,
  ANALYZE_SYSTEM_PROMPT,
  QA_JSON_SCHEMA,
  QA_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildQaUserPrompt,
} from "./prompts";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다. .env.local에 추가해주세요.");
  }
  return new GoogleGenAI({ apiKey });
}

function extractJsonText(text: string | undefined): string {
  if (!text) throw new Error("Gemini 응답에 텍스트가 없습니다.");
  return text;
}

export class GeminiProvider implements LlmProvider {
  async analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput> {
    const response = await client().models.generateContent({
      model: MODEL,
      contents: buildAnalyzeUserPrompt(input),
      config: {
        systemInstruction: ANALYZE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: ANALYZE_JSON_SCHEMA,
      },
    });
    return JSON.parse(extractJsonText(response.text)) as AnalyzeCodegenOutput;
  }

  async runQaAudit(input: QaAuditInput): Promise<QaAuditOutput> {
    const response = await client().models.generateContent({
      model: MODEL,
      contents: buildQaUserPrompt(input.files),
      config: {
        systemInstruction: QA_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: QA_JSON_SCHEMA,
      },
    });
    return JSON.parse(extractJsonText(response.text)) as QaAuditOutput;
  }
}
