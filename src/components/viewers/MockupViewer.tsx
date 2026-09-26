"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, Settings } from "lucide-react";

// 모바일 목업 뷰는 잠시 비활성화 — 나중에 다시 넣을 때는 이전 모바일 프레임
// JSX(320x640 rounded frame)와 PC/모바일 토글 버튼을 되살리면 된다.
export default function MockupViewer() {
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMockupUrl(data.mockupUrl || null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full min-h-[420px] flex-col items-center gap-4 bg-gray-50 p-6">
      <div className="flex w-full flex-1 items-center justify-center overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : mockupUrl ? (
          <div className="w-full max-w-[960px] shrink-0 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-xl">
            <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-100 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <iframe src={mockupUrl} title="목업 Agent" className="h-[600px] w-full border-0" />
          </div>
        ) : (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-200">
              <Smartphone size={20} className="text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-600">
              설정에서 목업 Agent URL을 등록해주세요.
            </p>
            <p className="text-xs text-gray-400">등록된 URL이 이 화면에 PC 목업으로 표시됩니다.</p>
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
            >
              <Settings size={13} /> 설정으로 이동
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
