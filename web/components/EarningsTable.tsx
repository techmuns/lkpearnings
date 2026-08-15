"use client";

import type { EarningsRow } from "@/lib/earnings";
import { formatCrore, formatPct, titleCaseResultType } from "@/lib/format";
import { ChangeBadge, MarginCompareBadge } from "./Badge";

function MetricCell({
  value,
  yoy,
  qoq,
  swing = null,
}: {
  value: number | null;
  yoy: number | null;
  qoq: number | null;
  swing?: string | null;
}) {
  return (
    <td className="px-4 py-3 align-top">
      <div className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-slate-800">
        {formatCrore(value)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <ChangeBadge label="YoY" pct={yoy} swing={swing} />
        <ChangeBadge label="QoQ" pct={qoq} />
      </div>
    </td>
  );
}

function SourceLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-slate-300">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      aria-label="Open source BSE filing"
      title="Open source BSE filing"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export function EarningsTable({
  rows,
  onRowClick,
}: {
  rows: EarningsRow[];
  onRowClick: (row: EarningsRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200/70">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            {["Company", "Revenue", "Net Profit", "EBITDA", "EBITDA Margin", "Source"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr
              key={row.dedup_key}
              onClick={() => onRowClick(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`View details for ${row.company_name}`}
              className="cursor-pointer transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:bg-brand-50"
            >
              <td className="px-4 py-3 align-top">
                <div className="font-semibold text-slate-800">{row.company_name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {row.quarter_label ? (
                    <span className="inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
                      {row.quarter_label}
                    </span>
                  ) : null}
                  {row.nse_symbol ? (
                    <span className="text-[11px] font-medium text-slate-400">{row.nse_symbol}</span>
                  ) : null}
                  <span className="text-[11px] text-slate-400">
                    {titleCaseResultType(row.result_type)}
                  </span>
                </div>
              </td>

              <MetricCell value={row.revenue_cr} yoy={row.revenue_yoy_pct} qoq={row.revenue_qoq_pct} />
              <MetricCell
                value={row.net_profit_cr}
                yoy={row.net_profit_yoy_pct}
                qoq={row.net_profit_qoq_pct}
                swing={row.net_profit_swing}
              />
              <MetricCell value={row.ebitda_cr} yoy={row.ebitda_yoy_pct} qoq={row.ebitda_qoq_pct} />

              <td className="px-4 py-3 align-top">
                <div className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-slate-800">
                  {formatPct(row.ebitda_margin_pct)}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <MarginCompareBadge label="YoY" current={row.ebitda_margin_pct} compare={row.ebitda_margin_yoy_pct} />
                  <MarginCompareBadge label="QoQ" current={row.ebitda_margin_pct} compare={row.ebitda_margin_qoq_pct} />
                </div>
              </td>

              <td className="px-4 py-3 align-middle">
                <SourceLink url={row.attachment_url} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
