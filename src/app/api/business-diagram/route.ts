import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { getLlmProvider } from "@/lib/llm";
import type { BusinessDiagramOutput, FileChange } from "@/lib/types";

// Split out of /api/test-reflect so this LLM call doesn't stack on top of
// the QA audit call in the same request — together they routinely exceeded
// Vercel Hobby's 60s serverless function cap. The client calls this
// separately, in parallel with polling for the Vercel/Render redeploy.
export const maxDuration = 60;

interface BusinessDiagramRequestBody {
  files: FileChange[];
  asIs: string;
  toBe: string;
}

/** Generates the "업무 비즈니스 요약" Mermaid diagram for the just-committed test 브랜치 source. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BusinessDiagramRequestBody;
    if (!body.files?.length) {
      return NextResponse.json({ error: "다이어그램을 생성할 파일 정보가 없습니다." }, { status: 400 });
    }

    const settings = await getSettings();
    const provider = getLlmProvider(settings.llmProvider, settings);
    const result: BusinessDiagramOutput = await provider.generateBusinessDiagram({
      files: body.files,
      asIs: body.asIs,
      toBe: body.toBe,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
