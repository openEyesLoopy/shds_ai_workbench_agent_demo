import clsx from "clsx";
import type { DiffEntry } from "@/lib/types";

interface RequirementDiffListProps {
  diffs: DiffEntry[];
}

const BADGE_STYLES: Record<DiffEntry["type"], string> = {
  ADD: "bg-emerald-100 text-emerald-700",
  MODIFY: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

/**
 * The requirement-level diff list shown on the "요구사항 분석" screen —
 * ADD/MODIFY/DELETE cards describing what changed, not the actual code diff
 * (that lives in the "코드 비교" tab of the post-테스트반영 dashboard instead).
 */
export default function RequirementDiffList({ diffs }: RequirementDiffListProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {diffs.map((diff, i) => (
        <div key={i} className="rounded-xl border border-panel-border p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={clsx(
                "rounded px-2 py-0.5 text-[11px] font-bold",
                BADGE_STYLES[diff.type]
              )}
            >
              {diff.type}
            </span>
            <span className="text-sm font-medium text-gray-700">{diff.component}</span>
          </div>
          <p className="text-sm text-gray-600">{diff.description}</p>
        </div>
      ))}
      {diffs.length === 0 && (
        <p className="p-2 text-sm text-gray-400">변경 사항이 없습니다.</p>
      )}
    </div>
  );
}
