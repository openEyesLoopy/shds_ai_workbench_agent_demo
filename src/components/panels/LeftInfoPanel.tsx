"use client";

import { useState } from "react";
import clsx from "clsx";
import { FileText } from "lucide-react";
import type { MenuTree, MenuTreeItem } from "@/lib/types";

interface LeftInfoPanelProps {
  planFileName: string;
  menuTree: MenuTree;
  blockedReason?: string;
}

type TreeTab = "asIs" | "toBe";

const TAB_LABEL: Record<TreeTab, string> = {
  asIs: "변경 전",
  toBe: "변경 후",
};

const ITEM_STATUS_STYLES: Record<NonNullable<MenuTreeItem["status"]>, string> = {
  ADD: "text-emerald-600",
  MODIFY: "text-amber-600",
  DELETE: "text-red-500 line-through",
};

const ITEM_STATUS_DOT: Record<NonNullable<MenuTreeItem["status"]>, string> = {
  ADD: "bg-emerald-500",
  MODIFY: "bg-amber-500",
  DELETE: "bg-red-400",
};

export default function LeftInfoPanel({
  planFileName,
  menuTree,
  blockedReason,
}: LeftInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<TreeTab>("toBe");
  const sections = menuTree[activeTab];
  const rootLabel = planFileName.replace(/\.[^./]+$/, "");

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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400">메뉴트리</p>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {(["asIs", "toBe"] as TreeTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-panel-border p-3">
          <p className="mb-2 truncate text-sm font-semibold text-gray-800">{rootLabel}</p>
          {sections.length === 0 ? (
            <p className="py-2 text-xs text-gray-400">메뉴 구조 정보가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3 border-l border-panel-border pl-3">
              {sections.map((section, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-gray-700">{section.name}</p>
                  {section.items.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-1.5 border-l border-panel-border pl-3">
                      {section.items.map((item, j) => (
                        <li key={j} className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              item.status ? ITEM_STATUS_DOT[item.status] : "bg-gray-300"
                            )}
                          />
                          <span
                            className={clsx(
                              "text-xs",
                              item.status ? ITEM_STATUS_STYLES[item.status] : "text-gray-600"
                            )}
                          >
                            {item.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
