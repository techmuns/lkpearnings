"use client";

import type { EarningsRow } from "@/lib/earnings";
import { accentFor } from "@/lib/accents";
import { formatCrore, formatPct, titleCaseResultType } from "@/lib/format";
import { Badge, ChangeBadge, MarginCompareBadge } from "./Badge";

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
      <div className="whitespace-nowrap text-[15px] font-bold text-slate-900">
        {formatCrore(value)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <ChangeBadge label="YoY" pct={yoy} swing={swing} />
        <ChangeBadge label="QoQ" pct={qoq} />
      </div>
    </td>
  );
}

function SourceLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-slate-400">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      aria-label="Open source BSE filing PDF in a new tab"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 7h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M9 4h6M12 11v5M9.5 13.5 12 16l2.5-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      PDF
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
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="bg-gradient-to-r from-brand-700 via-brand-600 to-sky-500 text-left text-white">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Company</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Revenue</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Net Profit</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">EBITDA</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
              EBITDA Margin
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => {
            const accent = accentFor(i);
            return (
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
                className="cursor-pointer transition-colors hover:bg-slate-50/80 focus:outline-none focus-visible:bg-brand-50"
              >
                <td className="px-4 py-3 align-top">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                      style={{ background: accent.bar }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{row.company_name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {row.bse_scrip_code ? (
                          <Badge tone="slate">BSE {row.bse_scrip_code}</Badge>
                        ) : null}
                        {row.nse_symbol ? <Badge tone="slate">{row.nse_symbol}</Badge> : null}
                        {row.quarter_label ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ background: accent.soft, color: accent.text }}
                          >
                            {row.quarter_label}
                          </span>
                        ) : null}
                        <span className="text-[11px] font-medium text-slate-400">
                          {titleCaseResultType(row.result_type)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <MetricCell
                  value={row.revenue_cr}
                  yoy={row.revenue_yoy_pct}
                  qoq={row.revenue_qoq_pct}
                />
                <MetricCell
                  value={row.net_profit_cr}
                  yoy={row.net_profit_yoy_pct}
                  qoq={row.net_profit_qoq_pct}
                  swing={row.net_profit_swing}
                />
                <MetricCell
                  value={row.ebitda_cr}
                  yoy={row.ebitda_yoy_pct}
                  qoq={row.ebitda_qoq_pct}
                />

                <td className="px-4 py-3 align-top">
                  <div className="whitespace-nowrap text-[15px] font-bold text-slate-900">
                    {formatPct(row.ebitda_margin_pct)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <MarginCompareBadge
                      label="YoY"
                      current={row.ebitda_margin_pct}
                      compare={row.ebitda_margin_yoy_pct}
                    />
                    <MarginCompareBadge
                      label="QoQ"
                      current={row.ebitda_margin_pct}
                      compare={row.ebitda_margin_qoq_pct}
                    />
                  </div>
                </td>

                <td className="px-4 py-3 align-top">
                  <SourceLink url={row.attachment_url} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
