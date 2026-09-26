import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in pdfjs-dist + the @napi-rs/canvas native binary. Left to
  // the default server bundler, Vercel's build drops the native binary and
  // /api/upload crashes at module load with "DOMMatrix is not defined" for
  // every upload, regardless of file type. Bundling these natively via
  // require() instead lets Vercel's file tracing pick up the binary.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // pdfjs-dist loads its worker via a runtime-computed import() path
  // (pdf.worker.mjs), which @vercel/nft's static analysis can't follow, so
  // it gets dropped from the deployed function and "Setting up fake worker
  // failed: Cannot find module .../pdf.worker.mjs" happens on every upload.
  // Force-include the whole package so the worker file ships with it.
  outputFileTracingIncludes: {
    "/api/upload": ["./node_modules/pdfjs-dist/**/*"],
  },
};

export default nextConfig;
