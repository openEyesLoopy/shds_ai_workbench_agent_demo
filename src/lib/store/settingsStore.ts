import { cookies } from "next/headers";
import type { LlmProviderName, WorkbenchSettings } from "@/lib/types";

const COOKIE_NAME = "workbench_settings";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const VALID_PROVIDERS: LlmProviderName[] = ["claude", "gemini", "openai"];

function defaultLlmProvider(): LlmProviderName {
  const fromEnv = process.env.DEFAULT_LLM_PROVIDER as LlmProviderName | undefined;
  return fromEnv && VALID_PROVIDERS.includes(fromEnv) ? fromEnv : "claude";
}

function defaultSettings(): WorkbenchSettings {
  return {
    llmProvider: defaultLlmProvider(),
    mockupUrl: process.env.MOCKUP_URL ?? "https://shds-demo-project-workbench-test.vercel.app/",
    githubOwner: process.env.GITHUB_OWNER ?? "moonctp24",
    githubRepo: process.env.GITHUB_REPO ?? "shds-demo-project-workbench",
    prodGithubOwner: process.env.PROD_GITHUB_OWNER ?? "openEyesLoopy",
    prodGithubRepo: process.env.PROD_GITHUB_REPO ?? "shds-demo-project-workbench_PROD",
  };
}

/**
 * Settings are stored in a browser cookie rather than a server-side file.
 * A serverless deployment (e.g. Vercel) has no writable, persistent
 * filesystem shared across invocations, so this is the store that actually
 * survives in production — and for a handful of small string fields, a
 * cookie is simpler than standing up an external KV/DB just for this.
 */
export async function getSettings(): Promise<WorkbenchSettings> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return defaultSettings();

  try {
    const stored = JSON.parse(raw) as Partial<WorkbenchSettings>;
    return { ...defaultSettings(), ...stored };
  } catch {
    return defaultSettings();
  }
}

export async function updateSettings(
  patch: Partial<WorkbenchSettings>
): Promise<WorkbenchSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };

  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(next), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return next;
}
