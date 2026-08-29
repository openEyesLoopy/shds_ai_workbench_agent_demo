"use client";

import { useState } from "react";
import { Upload, Code2, GitBranch, Rocket, Check, Settings } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

export interface SidebarStep {
  step: 1 | 2 | 3 | 4;
  label: string;
  icon: typeof Upload;
}

// 테스트뷰어 is no longer its own step — it's a tab inside the 테스트반영
// dashboard (step 3) now, alongside AI 시나리오 테스트 / 코드 비교. 운영반영
// (step 4) is its own separate screen from 테스트반영 (step 3).
const STEPS: SidebarStep[] = [
  { step: 1, label: "기획서 업로드", icon: Upload },
  { step: 2, label: "요구사항 분석", icon: Code2 },
  { step: 3, label: "테스트반영", icon: GitBranch },
  { step: 4, label: "최종 반영(운영반영)", icon: Rocket },
];

interface SidebarProps {
  currentStep: number;
  completedSteps: Set<number>;
  enabledSteps: Set<number>;
  onSelectStep: (step: 1 | 2 | 3 | 4) => void;
}

export default function Sidebar({
  currentStep,
  completedSteps,
  enabledSteps,
  onSelectStep,
}: SidebarProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <nav
      className={clsx(
        "relative z-20 flex shrink-0 flex-col items-center justify-between",
        "border-r border-panel-border bg-panel py-4",
        "h-16 w-full flex-row md:h-full md:w-[76px] md:flex-col"
      )}
    >
      <div className="flex flex-row items-center gap-3 md:flex-col md:gap-3">
        {STEPS.map(({ step, label, icon: Icon }) => {
          const isActive = currentStep === step;
          const isDone = completedSteps.has(step);
          const isEnabled = enabledSteps.has(step);

          return (
            <div
              key={step}
              className="relative"
              onMouseEnter={() => setHovered(step)}
              onMouseLeave={() => setHovered((h) => (h === step ? null : h))}
            >
              <button
                type="button"
                disabled={!isEnabled}
                onClick={() => {
                  setHovered(step);
                  onSelectStep(step as 1 | 2 | 3 | 4);
                }}
                className={clsx(
                  "flex items-center justify-center rounded-xl transition-all",
                  isActive
                    ? "h-11 w-11 scale-105 bg-black text-white shadow-sm"
                    : isDone
                      ? "h-10 w-10 bg-emerald-100 text-emerald-600"
                      : "h-10 w-10 text-gray-400 hover:bg-gray-100 hover:text-gray-600",
                  !isEnabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
                )}
                aria-label={label}
              >
                {isDone && !isActive ? <Check size={18} /> : <Icon size={18} />}
              </button>

              {hovered === step && (
                <div
                  className={clsx(
                    "pointer-events-none absolute z-30 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg",
                    "left-1/2 top-full mt-2 -translate-x-1/2 md:left-full md:top-1/2 md:mt-0 md:ml-2 md:-translate-y-1/2 md:translate-x-0"
                  )}
                >
                  {label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Link
        href="/settings"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        aria-label="설정"
      >
        <Settings size={18} />
      </Link>
    </nav>
  );
}
