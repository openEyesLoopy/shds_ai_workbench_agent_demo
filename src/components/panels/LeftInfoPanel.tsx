import { FileText } from "lucide-react";

interface LeftInfoPanelProps {
  planFileName: string;
  asIs: string;
  toBe: string;
  blockedReason?: string;
}

export default function LeftInfoPanel({
  planFileName,
  asIs,
  toBe,
  blockedReason,
}: LeftInfoPanelProps) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <p className="mb-2 text-xs font-semibold text-gray-400">대상 파일</p>
        <div className="flex items-center gap-3 rounded-lg border border-panel-border p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <FileText size={16} className="text-gray-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-800">{planFileName}</p>
            <p className="text-xs text-gray-400">업로드 및 파싱 완료</p>
          </div>
        </div>
      </div>

      {blockedReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {blockedReason}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-gray-400">기획 내용 총 요약</p>
        <div className="flex flex-col gap-3">
          <div>
            <span className="mb-1.5 inline-block rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              AS-IS
            </span>
            <p className="text-gray-600">{asIs}</p>
          </div>
          <div>
            <span className="mb-1.5 inline-block rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              TO-BE
            </span>
            <p className="text-gray-600">{toBe}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
