import { GoogleGenAI } from "@google/genai";
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
  ANALYZE_JSON_SCHEMA,
  ANALYZE_SYSTEM_PROMPT,
  BUSINESS_DIAGRAM_JSON_SCHEMA,
  BUSINESS_DIAGRAM_SYSTEM_PROMPT,
  QA_JSON_SCHEMA,
  QA_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildBusinessDiagramUserPrompt,
  buildQaUserPrompt,
} from "./prompts";
import { GEMINI_MODEL_OPTIONS, defaultModelId } from "./models";

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? defaultModelId(GEMINI_MODEL_OPTIONS);

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
  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput> {
    const response = await client().models.generateContent({
      model: this.model,
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
      model: this.model,
      contents: buildQaUserPrompt(input.files, input.previousFailures),
      config: {
        systemInstruction: QA_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: QA_JSON_SCHEMA,
      },
    });
    return JSON.parse(extractJsonText(response.text)) as QaAuditOutput;
  }

  async generateBusinessDiagram(input: BusinessDiagramInput): Promise<BusinessDiagramOutput> {
    const response = await client().models.generateContent({
      model: this.model,
      contents: buildBusinessDiagramUserPrompt(input),
      config: {
        systemInstruction: BUSINESS_DIAGRAM_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: BUSINESS_DIAGRAM_JSON_SCHEMA,
      },
    });
    return JSON.parse(extractJsonText(response.text)) as BusinessDiagramOutput;
  }
}
