import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { triggerVercelDeployment } from "@/lib/vercel/client";
import { triggerRenderDeploy } from "@/lib/render/client";

export const maxDuration = 60;

interface DeployTriggerBody {
  target?: string;
  sha?: string;
  sides?: string[];
}

/**
 * Explicitly asks Vercel and/or Render to deploy a commit that their own git
 * webhooks never picked up — called by lib/pollDeployStatus.ts when a commit
 * still has no deployment after a grace period, so a reflect can't wait on a
 * deployment that was never going to start. Each trigger is one quick POST.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DeployTriggerBody;
    if (body.target !== "test" && body.target !== "prod") {
      return NextResponse.json({ error: "target은 test 또는 prod여야 합니다." }, { status: 400 });
    }
    if (!body.sha) {
      return NextResponse.json({ error: "sha가 필요합니다." }, { status: 400 });
    }
    const sides = body.sides ?? [];

    const settings = await getSettings();
    const isTest = body.target === "test";
    const branch = isTest ? "test" : "main";
    const owner = isTest ? settings.githubOwner : settings.prodGithubOwner;
    const repo = isTest ? settings.githubRepo : settings.prodGithubRepo;
    const vercelProjectId = isTest ? process.env.VERCEL_PROJECT_ID : process.env.VERCEL_PROD_PROJECT_ID;
    const renderServiceId = isTest ? process.env.RENDER_TEST_SERVICE_ID : process.env.RENDER_PROD_SERVICE_ID;

    const tasks: Promise<void>[] = [];
    if (sides.includes("vercel")) {
      tasks.push(triggerVercelDeployment(vercelProjectId, branch, body.sha, owner, repo));
    }
    if (sides.includes("render")) {
      tasks.push(triggerRenderDeploy(body.sha, renderServiceId));
    }
    await Promise.all(tasks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
