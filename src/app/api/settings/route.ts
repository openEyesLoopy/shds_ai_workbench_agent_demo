import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/store/settingsStore";
import { parseRepoUrl } from "@/lib/github/parseRepoUrl";
import type { LlmProviderName } from "@/lib/types";
import { CLAUDE_MODEL_OPTIONS, GEMINI_MODEL_OPTIONS, OPENAI_MODEL_OPTIONS } from "@/lib/llm/models";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

const MODEL_FIELDS = [
  { key: "claudeModel", options: CLAUDE_MODEL_OPTIONS, label: "claudeModel" },
  { key: "geminiModel", options: GEMINI_MODEL_OPTIONS, label: "geminiModel" },
  { key: "openaiModel", options: OPENAI_MODEL_OPTIONS, label: "openaiModel" },
] as const;

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const patch: Record<string, unknown> = {};

  if (typeof body.llmProvider === "string") {
    const provider = body.llmProvider as LlmProviderName;
    if (provider !== "claude" && provider !== "gemini" && provider !== "openai") {
      return NextResponse.json(
        { error: "llmProvider는 claude, gemini, openai 중 하나여야 합니다." },
        { status: 400 }
      );
    }
    patch.llmProvider = provider;
  }

  for (const { key, options, label } of MODEL_FIELDS) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !options.some((o) => o.id === value)) {
      return NextResponse.json(
        { error: `${label}은(는) 다음 중 하나여야 합니다: ${options.map((o) => o.id).join(", ")}` },
        { status: 400 }
      );
    }
    patch[key] = value;
  }

  if (typeof body.mockupUrl === "string") patch.mockupUrl = body.mockupUrl.trim();

  // A full repo URL/shorthand (e.g. "https://github.com/owner/repo") takes
  // precedence when provided; otherwise fall back to explicit owner/repo fields.
  if (typeof body.repoUrl === "string" && body.repoUrl.trim()) {
    const parsed = parseRepoUrl(body.repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "GitHub 저장소 주소 형식이 올바르지 않습니다. 예: https://github.com/owner/repo" },
        { status: 400 }
      );
    }
    patch.githubOwner = parsed.owner;
    patch.githubRepo = parsed.repo;
  } else {
    if (typeof body.githubOwner === "string") patch.githubOwner = body.githubOwner.trim();
    if (typeof body.githubRepo === "string") patch.githubRepo = body.githubRepo.trim();
  }

  // Same pattern for the separate production repo that 운영반영 commits to.
  if (typeof body.prodRepoUrl === "string" && body.prodRepoUrl.trim()) {
    const parsed = parseRepoUrl(body.prodRepoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "운영 GitHub 저장소 주소 형식이 올바르지 않습니다. 예: https://github.com/owner/repo" },
        { status: 400 }
      );
    }
    patch.prodGithubOwner = parsed.owner;
    patch.prodGithubRepo = parsed.repo;
  } else {
    if (typeof body.prodGithubOwner === "string") patch.prodGithubOwner = body.prodGithubOwner.trim();
    if (typeof body.prodGithubRepo === "string") patch.prodGithubRepo = body.prodGithubRepo.trim();
  }

  const updated = await updateSettings(patch);
  return NextResponse.json(updated);
}
