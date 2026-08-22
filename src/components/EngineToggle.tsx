"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import clsx from "clsx";
import type { LlmProviderName } from "@/lib/types";

const ORDER: LlmProviderName[] = ["claude", "gemini", "openai"];

const LABEL: Record<LlmProviderName, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
};

export default function EngineToggle({ compact }: { compact?: boolean }) {
  const [provider, setProvider] = useState<LlmProviderName | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setProvider(data.llmProvider));
  }, []);

  async function cycle() {
    if (!provider || saving) return;
    const currentIndex = ORDER.indexOf(provider);
    const next = ORDER[(currentIndex + 1) % ORDER.length];
    setProvider(next);
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmProvider: next }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!provider) return null;

  return (
    <button
      type="button"
      onClick={cycle}
      title="분석 엔진 전환 (클릭)"
      className={clsx(
        "flex items-center gap-1.5 rounded-full border border-panel-border bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50",
        compact && "px-2"
      )}
    >
      <ArrowLeftRight size={11} className="text-gray-400" />
      {LABEL[provider]}
    </button>
  );
}
