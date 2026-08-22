import DOMMatrix from "@thednp/dommatrix";

/**
 * pdfjs-dist (used by pdf-parse) checks `globalThis.DOMMatrix` on load and,
 * if missing, tries to pull it from the native `@napi-rs/canvas` binary —
 * which Vercel's server bundler fails to trace into the function output,
 * crashing every /api/upload request. Text extraction never needs real
 * canvas rendering, so a pure-JS DOMMatrix is enough to satisfy the check.
 * Must be imported before "pdf-parse" so it runs first.
 */
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = DOMMatrix;
}
