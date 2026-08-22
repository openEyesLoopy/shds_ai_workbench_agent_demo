import { RefreshCw } from "lucide-react";

export default function AnalyzingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
          <RefreshCw className="animate-spin-slow text-gray-500" size={20} />
        </div>
        <p className="text-sm font-medium text-gray-600">분석 및 코드 생성 중...</p>
      </div>
    </div>
  );
}
