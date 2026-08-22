"use client";

import { useRef, useState } from "react";
import { FileText, Upload, Download } from "lucide-react";
import clsx from "clsx";

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  errorMessage?: string | null;
  disabled?: boolean;
}

const ACCEPTED = ".txt,.pdf,.ppt,.pptx,.xlsx";

export default function UploadDropzone({
  onFileSelected,
  errorMessage,
  disabled,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (disabled || !files || files.length === 0) return;
    onFileSelected(files[0]);
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
          <FileText className="text-gray-500" size={26} />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">기획서를 업로드 해주세요</h1>
        <p className="mt-2 text-sm text-gray-500">
          AI가 문서를 분석하여 UI 목업과 코드를 자동 생성합니다.
        </p>

        <div
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={clsx(
            "mt-6 flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors",
            isDragging ? "border-gray-400 bg-gray-50" : "border-gray-200 bg-white",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <Upload size={20} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">클릭하여 파일 선택</span>
          <span className="text-xs text-gray-400">.txt, .pdf, .ppt, .xlsx 지원</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {errorMessage && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <a
          href="/sample-plan.txt"
          download
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          <Download size={13} />
          샘플 기획서 템플릿 다운로드
        </a>
      </div>
    </div>
  );
}
