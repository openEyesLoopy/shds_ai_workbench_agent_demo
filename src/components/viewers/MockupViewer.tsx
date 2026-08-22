"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, Settings } from "lucide-react";

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
    <div className="flex h-full min-h-[420px] items-center justify-center bg-gray-50 p-6">
      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : mockupUrl ? (
        <div className="h-[640px] w-[320px] overflow-hidden rounded-[2rem] border-4 border-gray-900 bg-white shadow-xl">
          <iframe src={mockupUrl} title="목업 Agent" className="h-full w-full border-0" />
        </div>
      ) : (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-200">
            <Smartphone size={20} className="text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-600">
            설정에서 목업 Agent URL을 등록해주세요.
          </p>
          <p className="text-xs text-gray-400">
            등록된 URL이 이 화면에 모바일 목업으로 표시됩니다.
          </p>
          <Link
            href="/settings"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
          >
            <Settings size={13} /> 설정으로 이동
          </Link>
        </div>
      )}
    </div>
  );
}
