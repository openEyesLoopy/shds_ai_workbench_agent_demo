import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/store/settingsStore";
import { parseRepoUrl } from "@/lib/github/parseRepoUrl";
import type { LlmProviderName } from "@/lib/types";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

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

  const updated = await updateSettings(patch);
  return NextResponse.json(updated);
}
