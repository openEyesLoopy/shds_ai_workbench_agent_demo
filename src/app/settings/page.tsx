"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import clsx from "clsx";
import type { WorkbenchSettings } from "@/lib/types";
import { toRepoUrl } from "@/lib/github/parseRepoUrl";

const DEFAULTS: WorkbenchSettings = {
  llmProvider: "claude",
  mockupUrl: "",
  githubOwner: "",
  githubRepo: "",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<WorkbenchSettings>(DEFAULTS);
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: WorkbenchSettings) => {
        setSettings(data);
        setRepoUrlInput(toRepoUrl(data.githubOwner, data.githubRepo));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: settings.llmProvider,
          mockupUrl: settings.mockupUrl,
          repoUrl: repoUrlInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장 중 오류가 발생했습니다.");
        return;
      }
      setSettings(data);
      setRepoUrlInput(toRepoUrl(data.githubOwner, data.githubRepo));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6 md:p-10">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={15} /> Agent Workbench로 돌아가기
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">설정</h1>
        <p className="mt-1 text-sm text-gray-500">
          분석 엔진, 테스트뷰어에 표시할 목업 Agent URL, GitHub 대상 저장소를 설정합니다.
        </p>
      </div>

      <section className="rounded-xl border border-panel-border bg-panel p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">분석 엔진</h2>
        <div className="flex gap-3">
          {(["claude", "gemini", "openai"] as const).map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, llmProvider: provider }))}
              className={clsx(
                "flex-1 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                settings.llmProvider === provider
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-panel-border text-gray-600 hover:bg-gray-50"
              )}
            >
              {provider === "claude" ? "Claude" : provider === "gemini" ? "Gemini" : "ChatGPT"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          API 키는 서버의 .env.local (ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY)에서
          관리됩니다.
        </p>
      </section>

      <section className="rounded-xl border border-panel-border bg-panel p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">테스트뷰어 — 목업 Agent URL</h2>
        <input
          type="url"
          value={settings.mockupUrl}
          onChange={(e) => setSettings((s) => ({ ...s, mockupUrl: e.target.value }))}
          placeholder="https://example.com/mockup"
          className="w-full rounded-lg border border-panel-border px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <p className="mt-2 text-xs text-gray-400">
          &quot;테스트뷰어 확인&quot; 화면에 iframe으로 표시할 목업 Agent의 URL입니다.
        </p>
      </section>

      <section className="rounded-xl border border-panel-border bg-panel p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">GitHub 대상 저장소</h2>
        <input
          type="text"
          value={repoUrlInput}
          onChange={(e) => setRepoUrlInput(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="w-full rounded-lg border border-panel-border px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <p className="mt-2 text-xs text-gray-400">
          전체 GitHub 주소(예: https://github.com/owner/repo) 또는 owner/repo 형식으로 입력하세요.
          GITHUB_TOKEN(.env.local)이 이 저장소에 대한 쓰기 권한을 가지고 있어야 합니다.
        </p>
        {saveError && <p className="mt-2 text-xs font-medium text-red-600">{saveError}</p>}
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {saved && !saving ? <Check size={15} /> : null}
        {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
      </button>
    </div>
  );
}
