"use client";

import { useEffect, useRef, useState } from "react";
import { Workflow } from "lucide-react";

interface BusinessDiagramViewProps {
  mermaidDefinition: string | undefined;
  summary: string | undefined;
}

let renderCounter = 0;

// Matches the app's own palette (globals.css: --panel #fff, --panel-border
// #e5e7eb, --foreground #171717) plus its emerald "flow/success" accent
// (used throughout the 완료 banners) instead of Mermaid's default look, so
// the diagram reads as part of the same design system rather than a
// plugged-in widget. themeCSS rounds node/cluster corners and softens edges
// to match the rest of the UI's rounded-xl cards.
const MERMAID_THEME_VARIABLES = {
  fontFamily:
    "var(--font-sans), 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: "16px",
  primaryColor: "#ffffff",
  primaryTextColor: "#111827",
  primaryBorderColor: "#d1d5db",
  lineColor: "#10b981",
  secondaryColor: "#f9fafb",
  secondaryTextColor: "#111827",
  secondaryBorderColor: "#e5e7eb",
  tertiaryColor: "#f3f4f6",
  clusterBkg: "#ecfdf5",
  clusterBorder: "#a7f3d0",
  edgeLabelBackground: "#ffffff",
  nodeTextColor: "#111827",
};

const MERMAID_THEME_CSS = `
  .node rect, .node polygon, .node circle, .node ellipse {
    rx: 12px; ry: 12px;
    stroke-width: 1.5px;
    filter: drop-shadow(0 2px 4px rgba(17, 24, 39, 0.08));
  }
  .cluster rect { rx: 16px; ry: 16px; stroke-dasharray: 0; stroke-width: 1.25px; }
  .cluster-label span, .cluster-label foreignObject div {
    font-weight: 700;
    color: #047857;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .edgePath .path { stroke-width: 1.75px; }
  .edgeLabel { background-color: #ffffff; border-radius: 6px; font-weight: 500; }
  .label { color: #111827; }
`;

/** Renders the "업무 비즈니스" Mermaid flowchart generated against the just-테스트반영된 test 브랜치 source. */
export default function BusinessDiagramView({ mermaidDefinition, summary }: BusinessDiagramViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mermaidDefinition) return;
    let cancelled = false;

    (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: MERMAID_THEME_VARIABLES,
        themeCSS: MERMAID_THEME_CSS,
        flowchart: { curve: "basis", htmlLabels: true, padding: 20, nodeSpacing: 45, rankSpacing: 65 },
      });
      try {
        const id = `business-diagram-${++renderCounter}`;
        const { svg } = await mermaid.render(id, mermaidDefinition);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Mermaid pins the SVG to a small intrinsic size via inline
          // `style="max-width: ...px"` + a `height` attribute — neither is
          // overridable by a CSS class (inline styles win), so drop them and
          // let the SVG's own viewBox scale it up to fill the panel instead.
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.removeProperty("max-width");
            svgEl.removeAttribute("height");
            svgEl.setAttribute("width", "100%");
            svgEl.style.height = "auto";
          }
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "다이어그램을 그리지 못했습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mermaidDefinition]);

  if (!mermaidDefinition) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center">
        <Workflow size={22} className="text-gray-300" />
        <p className="text-sm text-gray-400">업무 비즈니스 다이어그램을 생성하지 못했습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {summary && (
        <p className="rounded-lg border border-panel-border bg-gray-50 p-3 text-xs text-gray-600">
          {summary}
        </p>
      )}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          다이어그램 렌더링 오류: {error}
        </div>
      ) : (
        <div className="flex min-h-[480px] flex-1 items-center justify-center overflow-auto rounded-xl bg-gray-50/60 p-6">
          <div ref={containerRef} className="w-full [&_svg]:w-full" />
        </div>
      )}
    </div>
  );
}
