import JSZip from "jszip";

const TEXT_TAG = /<a:t>([^<]*)<\/a:t>/g;

/**
 * Extracts slide text from a .pptx (OOXML zip) file. Legacy binary .ppt files
 * are not zip archives and will fail to load here — surfaced as a clear error
 * rather than silently returning nothing.
 */
export async function parsePptx(buffer: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(
      "레거시 .ppt(바이너리) 형식은 지원하지 않습니다. .pptx로 저장한 뒤 다시 업로드해주세요."
    );
  }

  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const slideTexts: string[] = [];
  for (const slidePath of slidePaths) {
    const xml = await zip.files[slidePath].async("string");
    const texts: string[] = [];
    for (const match of xml.matchAll(TEXT_TAG)) {
      if (match[1]) texts.push(match[1]);
    }
    slideTexts.push(texts.join(" "));
  }

  return slideTexts
    .map((text, i) => `## Slide ${i + 1}\n${text}`)
    .join("\n\n");
}
