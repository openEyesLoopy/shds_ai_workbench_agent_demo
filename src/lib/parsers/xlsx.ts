import ExcelJS from "exceljs";

export async function parseXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`## Sheet: ${sheet.name}`);
    sheet.eachRow((row) => {
      const cells = (row.values as unknown[])
        .slice(1)
        .map((v) => (v == null ? "" : String(v)))
        .join(" | ");
      if (cells.trim().length > 0) lines.push(cells);
    });
  });
  return lines.join("\n");
}
