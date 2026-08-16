import type { EarningsRow } from "./earnings";
import { cleanQuarter, formatDate, titleCaseResultType } from "./format";

/**
 * Dependency-free Excel export using the SpreadsheetML 2003 XML format — which
 * gives real column widths, wrapped text, number formats, a bold frozen header,
 * an autofilter and NO gridlines (far cleaner than an HTML-table export).
 * Opens natively in Excel / LibreOffice / Google Sheets.
 */

type Kind = "text" | "center" | "num" | "pct";

interface Col {
  header: string;
  width: number;
  kind: Kind;
  get: (r: EarningsRow) => string | number | null;
}

const COLS: Col[] = [
  { header: "Company", width: 230, kind: "text", get: (r) => r.company_name },
  { header: "Quarter", width: 64, kind: "center", get: (r) => cleanQuarter(r.period_end, r.quarter_label) ?? "" },
  { header: "Result Type", width: 92, kind: "center", get: (r) => titleCaseResultType(r.result_type) },
  { header: "Revenue (Rs Cr)", width: 100, kind: "num", get: (r) => r.revenue_cr },
  { header: "Rev YoY %", width: 72, kind: "pct", get: (r) => r.revenue_yoy_pct },
  { header: "Rev QoQ %", width: 72, kind: "pct", get: (r) => r.revenue_qoq_pct },
  { header: "Net Profit (Rs Cr)", width: 108, kind: "num", get: (r) => r.net_profit_cr },
  { header: "NP YoY %", width: 72, kind: "pct", get: (r) => r.net_profit_yoy_pct },
  { header: "NP QoQ %", width: 72, kind: "pct", get: (r) => r.net_profit_qoq_pct },
  { header: "EBITDA (Rs Cr)", width: 100, kind: "num", get: (r) => r.ebitda_cr },
  { header: "EBITDA YoY %", width: 84, kind: "pct", get: (r) => r.ebitda_yoy_pct },
  { header: "EBITDA QoQ %", width: 84, kind: "pct", get: (r) => r.ebitda_qoq_pct },
  { header: "EBITDA Margin %", width: 100, kind: "pct", get: (r) => r.ebitda_margin_pct },
  { header: "Filed", width: 96, kind: "center", get: (r) => formatDate(r.filed_at) },
];

const STYLE_ID: Record<Kind, string> = {
  text: "txt",
  center: "ctr",
  num: "num",
  pct: "pct",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cell(col: Col, r: EarningsRow): string {
  const id = STYLE_ID[col.kind];
  const v = col.get(r);
  if (col.kind === "num" || col.kind === "pct") {
    if (typeof v === "number" && Number.isFinite(v)) {
      return `<Cell ss:StyleID="${id}"><Data ss:Type="Number">${v}</Data></Cell>`;
    }
    return `<Cell ss:StyleID="${id}"/>`; // blank for missing numbers
  }
  return `<Cell ss:StyleID="${id}"><Data ss:Type="String">${esc(v)}</Data></Cell>`;
}

export function buildEarningsWorkbookXml(rows: EarningsRow[]): string {
  const columns = COLS.map((c) => `<Column ss:Width="${c.width}"/>`).join("");
  const header = COLS.map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(c.header)}</Data></Cell>`).join("");
  const body = rows
    .map((r) => `<Row ss:Height="17">${COLS.map((c) => cell(c, r)).join("")}</Row>`)
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1E293B"/></Style>
  <Style ss:ID="title"><Font ss:FontName="Calibri" ss:Bold="1" ss:Size="14" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/></Style>
  <Style ss:ID="hdr"><Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="txt"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="ctr"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="num"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="#,##0.00"/></Style>
  <Style ss:ID="pct"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="0.0"/></Style>
 </Styles>
 <Worksheet ss:Name="Earnings">
  <Table>
   ${columns}
   <Row ss:Height="28"><Cell ss:MergeAcross="${COLS.length - 1}" ss:StyleID="title"><Data ss:Type="String">Earnings Tracker — LKP Securities</Data></Cell></Row>
   <Row ss:Height="30">${header}</Row>
   ${body}
  </Table>
  <AutoFilter x:Range="R2C1:R2C${COLS.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DoNotDisplayGridlines/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>2</SplitHorizontal>
   <TopRowBottomPane>2</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

export function exportEarningsToExcel(rows: EarningsRow[], filename = "lkp-earnings.xls"): void {
  const xml = buildEarningsWorkbookXml(rows);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
