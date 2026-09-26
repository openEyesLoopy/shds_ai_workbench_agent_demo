"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Workflow } from "lucide-react";

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
// Layout constants for the exported PDF page.
const PDF_FONT_STACK = "'Pretendard', -apple-system, 'Segoe UI', sans-serif";
const PDF_PADDING = 24;
const PDF_TITLE_HEIGHT = 32;
const PDF_TITLE_FONT = `bold 18px ${PDF_FONT_STACK}`;
const PDF_SUMMARY_FONT = `13px ${PDF_FONT_STACK}`;
const PDF_SUMMARY_LINE_HEIGHT = 20;
// Mermaid's node/edge labels are rendered as `<foreignObject><div>...</div></foreignObject>`
// (Mermaid v11's flowchart renderer always does this — the `htmlLabels`
// option no longer disables it). A canvas that has ever drawn an <img>
// sourced from that SVG becomes permanently "tainted" and throws on
// `toDataURL`/`getImageData` (verified directly: rasterizing the whole
// diagram via an Image+canvas throws `SecurityError: Tainted canvases may
// not be exported`) — so the diagram itself can't be rasterized this way.
// svg2pdf.js instead draws the SVG's vector shapes/paths straight into the
// PDF with no canvas involved (no tainting), but it has no support for
// foreignObject content, so it silently drops every text label. The fix:
// draw the vector diagram via svg2pdf, then separately rasterize *just the
// label text* — one small canvas per label, each only ever calling
// `fillText` (never `drawImage` on anything SVG-derived, so never tainted)
// — and stamp each one as an image at its label's exact position. A single
// page-sized transparent overlay for this was tried first and produced a
// ~40MB PDF (jsPDF's PNG embedding compresses a mostly-transparent giant
// bitmap poorly); many small per-label images are a few KB each.
const LABEL_IMAGE_SCALE = 2;

function textToPngDataUrl(
  text: string,
  cssWidth: number,
  cssHeight: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "center"
): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(cssWidth * LABEL_IMAGE_SCALE);
  canvas.height = Math.ceil(cssHeight * LABEL_IMAGE_SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(LABEL_IMAGE_SCALE, LABEL_IMAGE_SCALE);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const x = align === "left" ? 0 : cssWidth / 2;
  ctx.fillText(text, x, cssHeight / 2);
  return canvas.toDataURL("image/png");
}

function wrapPlainText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const ch of paragraph) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export default function BusinessDiagramView({ mermaidDefinition, summary }: BusinessDiagramViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleDownloadPdf() {
    const svgEl = containerRef.current?.querySelector("svg");
    if (!svgEl) return;
    setIsExporting(true);
    setExportError(null);
    try {
      // The SVG's `viewBox` is mermaid's own authoritative content size — it
      // never changes regardless of how CSS happens to be displaying the
      // element at export time (shrunk to fit a narrow panel, a flex item
      // that won't shrink below its content per the CSS `min-width: auto`
      // default, etc. — all of which made `getBoundingClientRect()` an
      // unreliable, moving target that cropped the diagram in earlier
      // attempts). Render the PDF diagram at exactly the viewBox's own
      // dimensions (1:1, no scaling ambiguity at all), and convert each
      // label's on-screen rect into that same viewBox coordinate space via
      // one scale factor, so the vector diagram and the text overlays always
      // agree no matter what size the SVG happens to be displayed at.
      const viewBox = svgEl.viewBox.baseVal;
      const svgWidth = viewBox.width;
      const svgHeight = viewBox.height;
      const svgRect = svgEl.getBoundingClientRect();
      const scale = svgRect.width > 0 ? svgWidth / svgRect.width : 1;

      const measureCanvas = document.createElement("canvas");
      const measureCtx = measureCanvas.getContext("2d")!;
      measureCtx.font = PDF_SUMMARY_FONT;
      const contentWidth = Math.max(svgWidth, 480);
      const summaryLines = summary ? wrapPlainText(measureCtx, summary, contentWidth) : [];
      const summaryHeight = summaryLines.length
        ? summaryLines.length * PDF_SUMMARY_LINE_HEIGHT + 12
        : 0;

      const pageWidth = contentWidth + PDF_PADDING * 2;
      const diagramOriginX = PDF_PADDING;
      const diagramOriginY = PDF_PADDING + PDF_TITLE_HEIGHT + summaryHeight;
      const pageHeight = diagramOriginY + svgHeight + PDF_PADDING;

      const { jsPDF } = await import("jspdf");
      await import("svg2pdf.js");
      const pdf = new jsPDF({ unit: "px", format: [pageWidth, pageHeight] });
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      // Vector shapes/lines first (svg2pdf can't draw the foreignObject
      // text labels at all — it silently skips them).
      await pdf.svg(svgEl, {
        x: diagramOriginX,
        y: diagramOriginY,
        width: svgWidth,
        height: svgHeight,
      });

      // Title + summary, as plain rasterized text (small images, not one
      // page-sized canvas — see the note above textToPngDataUrl).
      const titleUrl = textToPngDataUrl(
        "업무 비즈니스 요약",
        contentWidth,
        PDF_TITLE_HEIGHT,
        PDF_TITLE_FONT,
        "#111827",
        "left"
      );
      pdf.addImage(titleUrl, "PNG", PDF_PADDING, PDF_PADDING - 6, contentWidth, PDF_TITLE_HEIGHT);
      if (summaryLines.length) {
        // textToPngDataUrl centers one fillText call per image, so draw one
        // small image per wrapped line rather than the whole paragraph at once.
        let lineY = PDF_PADDING + PDF_TITLE_HEIGHT;
        for (const line of summaryLines) {
          const lineUrl = textToPngDataUrl(
            line,
            contentWidth,
            PDF_SUMMARY_LINE_HEIGHT,
            PDF_SUMMARY_FONT,
            "#4b5563",
            "left"
          );
          pdf.addImage(lineUrl, "PNG", PDF_PADDING, lineY, contentWidth, PDF_SUMMARY_LINE_HEIGHT);
          lineY += PDF_SUMMARY_LINE_HEIGHT;
        }
      }

      // One small image per node/edge label, stamped at that label's exact
      // position — its on-screen rect converted into the same viewBox units
      // the vector diagram above was rendered at, via `scale`.
      const foreignObjects = svgEl.querySelectorAll("foreignObject");
      foreignObjects.forEach((fo) => {
        const rect = fo.getBoundingClientRect();
        const w = rect.width * scale;
        const h = rect.height * scale;
        if (w < 1 || h < 1) return; // mermaid's internal measurement copies
        const text = fo.textContent?.trim();
        if (!text) return;
        // The box (w/h) is scaled from its on-screen size, so the font size
        // must scale with it too, or text sized for the *unscaled* box can
        // overflow/misalign within the now-larger-or-smaller box.
        const labelFont = `${12 * scale}px ${PDF_FONT_STACK}`;
        const labelUrl = textToPngDataUrl(text, w, h, labelFont, "#111827");
        pdf.addImage(
          labelUrl,
          "PNG",
          diagramOriginX + (rect.left - svgRect.left) * scale,
          diagramOriginY + (rect.top - svgRect.top) * scale,
          w,
          h
        );
      });

      pdf.save(`업무비즈니스_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(false);
    }
  }

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
          // Mermaid pins the SVG to its natural computed size via inline
          // `style="max-width: ...px"` + a `height` attribute. We can't just
          // delete both and set `width: auto` — an SVG with only a `viewBox`
          // and no intrinsic width/height resolves CSS `auto` width to "fill
          // the containing block" (same as a block-level element), which is
          // exactly the "one giant node stretched to fill the panel" bug for
          // a small/simple diagram. Instead, carry mermaid's own computed
          // natural width over into an explicit CSS width (so a small
          // diagram stays small) and only let `max-width: 100%` shrink it
          // when the panel is narrower than that (so a large diagram still
          // fits) — a real min(natural, container) responsive size.
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            const naturalWidth = svgEl.style.maxWidth || svgEl.getAttribute("width") || "100%";
            svgEl.removeAttribute("height");
            svgEl.removeAttribute("width");
            svgEl.style.width = naturalWidth;
            svgEl.style.height = "auto";
            svgEl.style.maxWidth = "100%";
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
      <div className="flex items-start justify-between gap-3">
        {summary ? (
          <p className="flex-1 rounded-lg border border-panel-border bg-gray-50 p-3 text-xs text-gray-600">
            {summary}
          </p>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isExporting || !!error}
          title="이 업무 비즈니스 다이어그램을 PDF로 다운로드"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-panel-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={13} className={isExporting ? "animate-pulse" : undefined} />
          {isExporting ? "PDF 생성 중..." : "PDF 다운로드"}
        </button>
      </div>
      {exportError && <p className="text-xs text-red-600">{exportError}</p>}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          다이어그램 렌더링 오류: {error}
        </div>
      ) : (
        // `items-center`/`justify-center` on a scrollable flex container is a
        // well-known trap: once the content is taller/wider than the
        // container, centering makes the part of it *before* the centered
        // point permanently unreachable by scrolling (scroll down then back
        // up and the top stays clipped) — the scrollable range only ever
        // covers the overflow *after* the center point. `w-fit mx-auto`
        // centers the diagram only while it's smaller than the panel, and
        // falls back to flush-left/top (full, reachable scroll range) once
        // it overflows either axis.
        <div className="max-h-[70vh] min-h-[480px] flex-1 overflow-auto rounded-xl bg-gray-50/60 p-6">
          <div ref={containerRef} className="mx-auto w-fit" />
        </div>
      )}
    </div>
  );
}
