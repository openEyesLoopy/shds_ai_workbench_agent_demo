import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { checkVercelDeployment } from "@/lib/vercel/client";
import { checkRenderDeployment } from "@/lib/render/client";
import type { DeployStatusResult } from "@/lib/types";

/**
 * One-shot Vercel/Render deploy status check for a single commit — no
 * internal wait loop (see checkVercelDeployment/checkRenderDeployment for
 * why: this app runs on Vercel's Hobby plan, which kills serverless
 * functions at 60s, so 테스트반영/운영반영/초기화 previously 504'd whenever the
 * actual Vercel/Render build took longer than that). The *client* calls this
 * repeatedly (see lib/pollDeployStatus.ts) until both reach a terminal
 * state, so no single request ever has to stay open longer than one quick
 * HTTP round trip to Vercel + Render.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("target");
    const sha = searchParams.get("sha");
    if (target !== "test" && target !== "prod") {
      return NextResponse.json({ error: "target은 test 또는 prod여야 합니다." }, { status: 400 });
    }
    if (!sha) {
      return NextResponse.json({ error: "sha가 필요합니다." }, { status: 400 });
    }

    const branch = target === "test" ? "test" : "main";
    const vercelProjectId =
      target === "test" ? process.env.VERCEL_PROJECT_ID : process.env.VERCEL_PROD_PROJECT_ID;
    const renderServiceId =
      target === "test" ? process.env.RENDER_TEST_SERVICE_ID : process.env.RENDER_PROD_SERVICE_ID;

    // Settings aren't actually needed for the checks themselves (Vercel/Render
    // are keyed by project/service id, not by GitHub owner/repo), but fetch
    // them anyway to fail fast/consistently the same way the other routes do
    // if settings are misconfigured.
    await getSettings();

    const [vercel, render] = await Promise.all([
      checkVercelDeployment(sha, vercelProjectId, branch),
      checkRenderDeployment(sha, renderServiceId),
    ]);

    const result: DeployStatusResult = { vercel, render };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
