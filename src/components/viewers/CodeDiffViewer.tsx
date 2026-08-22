"use client";

import { useMemo, useState } from "react";
import { Folder, FolderOpen, FileCode2, ChevronRight, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { FileChange } from "@/lib/types";
import { buildFileTree, type TreeNode } from "@/lib/fileTree";
import { diffLines } from "@/lib/diffLines";

interface CodeDiffViewerProps {
  baselinePaths: string[];
  changes: FileChange[];
}

function TreeRow({
  node,
  depth,
  activeTab,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  activeTab: string;
  onSelectFile: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);

  if (node.isFile) {
    return (
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: depth * 16 + 8 }}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded py-1 pr-2 text-left text-[13px] hover:bg-white/5",
          activeTab === node.path ? "bg-white/10 text-white" : "text-gray-300"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <FileCode2 size={14} className="shrink-0 text-gray-500" />
          <span className="truncate">{node.name}</span>
        </span>
        {node.changed && (
          <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            1 변경됨
          </span>
        )}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: depth * 16 + 8 }}
        className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[13px] text-gray-300 hover:bg-white/5"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? <FolderOpen size={14} className="text-gray-500" /> : <Folder size={14} className="text-gray-500" />}
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              activeTab={activeTab}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CodeDiffViewer({ baselinePaths, changes }: CodeDiffViewerProps) {
  const [activeTab, setActiveTab] = useState<string>("tree");

  const changedPaths = useMemo(() => new Set(changes.map((c) => c.path)), [changes]);
  const allPaths = useMemo(() => {
    const set = new Set([...baselinePaths, ...changes.map((c) => c.path)]);
    return Array.from(set);
  }, [baselinePaths, changes]);
  const tree = useMemo(() => buildFileTree(allPaths, changedPaths), [allPaths, changedPaths]);

  const activeChange = changes.find((c) => c.path === activeTab);
  const openTabs = changes.slice(0, 6);

  return (
    <div className="flex h-full flex-col bg-code-panel text-gray-200">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-code-panel-border px-2 py-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("tree")}
          className={clsx(
            "flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium",
            activeTab === "tree" ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"
          )}
        >
          <Folder size={13} /> 디렉토리
        </button>
        {openTabs.map((change) => (
          <button
            key={change.path}
            type="button"
            onClick={() => setActiveTab(change.path)}
            className={clsx(
              "flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium",
              activeTab === change.path ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            {change.path.split("/").pop()}
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === "tree" ? (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-500">
              프로젝트 탐색기
            </p>
            {tree.map((node) => (
              <TreeRow key={node.path} node={node} depth={0} activeTab={activeTab} onSelectFile={setActiveTab} />
            ))}
          </div>
        ) : activeChange ? (
          <DiffPane change={activeChange} />
        ) : (
          <p className="p-4 text-sm text-gray-500">파일을 선택해주세요.</p>
        )}
      </div>
    </div>
  );
}

function DiffPane({ change }: { change: FileChange }) {
  const lines = useMemo(
    () => diffLines(change.oldContent ?? "", change.newContent ?? ""),
    [change]
  );

  return (
    <div className="font-mono text-[12.5px] leading-relaxed">
      <p className="border-b border-code-panel-border px-4 py-2 text-xs text-gray-500">
        ## {change.path.toUpperCase()} ##
      </p>
      {lines.map((line, i) => (
        <div
          key={i}
          className={clsx(
            "whitespace-pre px-4 py-0.5",
            line.type === "add" && "bg-emerald-500/10 text-emerald-300",
            line.type === "remove" && "bg-red-500/10 text-red-300",
            line.type === "context" && "text-gray-400"
          )}
        >
          <span className="mr-2 select-none text-gray-600">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}
