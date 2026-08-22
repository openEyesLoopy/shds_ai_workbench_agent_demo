import { parseTxt } from "./txt";
import { parsePdf } from "./pdf";
import { parseXlsx } from "./xlsx";
import { parsePptx } from "./pptx";

export async function parsePlanDocument(
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  switch (ext) {
    case "txt":
      return parseTxt(buffer);
    case "pdf":
      return parsePdf(buffer);
    case "xlsx":
      return parseXlsx(buffer);
    case "pptx":
    case "ppt":
      return parsePptx(buffer);
    default:
      throw new Error(
        `지원하지 않는 파일 형식입니다 (.txt, .pdf, .ppt, .xlsx 만 지원): .${ext}`
      );
  }
}
