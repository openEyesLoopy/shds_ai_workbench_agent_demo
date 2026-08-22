import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in pdfjs-dist + the @napi-rs/canvas native binary. Left to
  // the default server bundler, Vercel's build drops the native binary and
  // /api/upload crashes at module load with "DOMMatrix is not defined" for
  // every upload, regardless of file type. Bundling these natively via
  // require() instead lets Vercel's file tracing pick up the binary.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
