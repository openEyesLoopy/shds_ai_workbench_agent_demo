import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { promoteBranch, repoCommitUrl } from "@/lib/github/client";
import type { FinalizeResult } from "@/lib/types";

export async function POST() {
  try {
    const settings = await getSettings();
    const sha = await promoteBranch(settings.githubOwner, settings.githubRepo, "test", "PROD");

    const result: FinalizeResult = {
      ok: true,
      commitSha: sha,
      branch: "PROD",
      repoUrl: repoCommitUrl(settings.githubOwner, settings.githubRepo, sha),
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
