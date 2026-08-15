import type { EarningsRow } from "./earnings";
import { titleCaseResultType } from "./format";

/**
 * Dependency-free Excel export: an HTML table served as `.xls`, which Excel /
 * Google Sheets / LibreOffice all open natively. Includes a branded title row,
 * a colored frozen header, numeric columns (mso-number-format so Excel treats
 * them as numbers), and an autofilter.
 */

const COLUMNS: { label: string; kind: "text" | "num2" | "pct1" | "url" }[] = [
  { label: "Company", kind: "text" },
  { label: "BSE", kind: "text" },
  { label: "NSE", kind: "text" },
  { label: "Quarter", kind: "text" },
  { label: "Result type", kind: "text" },
  { label: "Revenue RsCr", kind: "num2" },
  { label: "Rev YoY%", kind: "pct1" },
  { label: "Rev QoQ%", kind: "pct1" },
  { label: "Net Profit RsCr", kind: "num2" },
  { label: "NP YoY%", kind: "pct1" },
  { label: "NP QoQ%", kind: "pct1" },
  { label: "EBITDA RsCr", kind: "num2" },
  { label: "EBITDA YoY%", kind: "pct1" },
  { label: "EBITDA QoQ%", kind: "pct1" },
  { label: "EBITDA Margin%", kind: "pct1" },
  { label: "Filed", kind: "text" },
  { label: "Source URL", kind: "url" },
];

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numCell(v: number | null | undefined, cls: string): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return `<td class="${cls}"></td>`;
  return `<td class="${cls}">${v}</td>`;
}

function rowCells(r: EarningsRow): string {
  const filed = r.filed_at ? esc(r.filed_at) : "";
  return [
    `<td class="tx">${esc(r.company_name)}</td>`,
    `<td class="tx">${esc(r.bse_scrip_code ?? "")}</td>`,
    `<td class="tx">${esc(r.nse_symbol ?? "")}</td>`,
    `<td class="tx">${esc(r.quarter_label ?? "")}</td>`,
    `<td class="tx">${esc(titleCaseResultType(r.result_type))}</td>`,
    numCell(r.revenue_cr, "n2"),
    numCell(r.revenue_yoy_pct, "p1"),
    numCell(r.revenue_qoq_pct, "p1"),
    numCell(r.net_profit_cr, "n2"),
    numCell(r.net_profit_yoy_pct, "p1"),
    numCell(r.net_profit_qoq_pct, "p1"),
    numCell(r.ebitda_cr, "n2"),
    numCell(r.ebitda_yoy_pct, "p1"),
    numCell(r.ebitda_qoq_pct, "p1"),
    numCell(r.ebitda_margin_pct, "p1"),
    `<td class="tx">${filed}</td>`,
    `<td class="tx">${esc(r.attachment_url ?? "")}</td>`,
  ].join("");
}

export function buildEarningsWorkbookHtml(rows: EarningsRow[]): string {
  const ncols = COLUMNS.length;
  const header = COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => `<tr>${rowCells(r)}</tr>`).join("");
  // Freeze the top 2 rows (title + header); autofilter over the header row.
  const lastCol = String.fromCharCode(64 + ncols); // A..Q for <=17 cols
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<!--[if gte mso 9]><xml>
 <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
  <x:Name>Earnings</x:Name>
  <x:WorksheetOptions>
   <x:FreezePanes/>
   <x:FrozenNoSplit/>
   <x:SplitHorizontal>2</x:SplitHorizontal>
   <x:TopRowBottomPane>2</x:TopRowBottomPane>
   <x:ActivePane>2</x:ActivePane>
   <x:Panes><x:Pane><x:Number>3</x:Number></x:Pane><x:Pane><x:Number>2</x:Number></x:Pane></x:Panes>
   <x:AutoFilter x:Range="A2:${lastCol}2"/>
   <x:DisplayGridlines/>
  </x:WorksheetOptions>
 </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>
  table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  td, th { border: 0.5pt solid #cbd5e1; padding: 4px 8px; }
  .title { background: #1e3a8a; color: #ffffff; font-size: 15pt; font-weight: bold; text-align: left; }
  thead th { background: #2563eb; color: #ffffff; font-weight: bold; text-align: center; mso-pattern: solid #2563eb; }
  .tx { mso-number-format: "\\@"; }
  .n2 { mso-number-format: "#,##0.00"; text-align: right; }
  .p1 { mso-number-format: "0.0"; text-align: right; }
</style>
</head>
<body>
<table>
  <tr><td class="title" colspan="${ncols}">Earnings Tracker — LKP Securities</td></tr>
  <thead><tr>${header}</tr></thead>
  <tbody>${body}</tbody>
</table>
</body>
</html>`;
}

export function exportEarningsToExcel(rows: EarningsRow[], filename = "lkp-earnings.xls"): void {
  const html = buildEarningsWorkbookHtml(rows);
  // Prepend a UTF-8 BOM so Excel reads non-ASCII (₹, em dashes) correctly.
  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
