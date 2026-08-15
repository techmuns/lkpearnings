"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { EarningsRow } from "@/lib/earnings";
import {
  formatCroreBare,
  formatDate,
  formatDateTime,
  formatPct,
  titleCaseResultType,
} from "@/lib/format";
import { Badge, ChangeBadge, MarginCompareBadge } from "./Badge";

function PeriodHeader({ label, date }: { label: string; date: string | null }) {
  return (
    <th className="px-3 py-2 text-right">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[10px] font-medium text-slate-400">{formatDate(date)}</div>
    </th>
  );
}

function ValueRow({
  name,
  cur,
  prev,
  yr,
  isPct = false,
}: {
  name: string;
  cur: number | null;
  prev: number | null;
  yr: number | null;
  isPct?: boolean;
}) {
  const fmt = (v: number | null) => (isPct ? formatPct(v) : formatCroreBare(v));
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2.5 text-sm font-medium text-slate-600">{name}</td>
      <td className="bg-brand-50/50 px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">
        {fmt(cur)}
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-500">{fmt(prev)}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-500">{fmt(yr)}</td>
    </tr>
  );
}

function ChangeRow({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm font-medium text-slate-600">{name}</span>
      <span className="flex flex-wrap justify-end gap-1">{children}</span>
    </div>
  );
}

export function EarningsModal({
  row,
  onClose,
}: {
  row: EarningsRow;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const unit = row.reporting_unit ?? "not specified";
  const conf =
    typeof row.extraction_confidence === "number"
      ? `${Math.round(row.extraction_confidence * 100)}%`
      : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="earnings-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="modal-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-sky-500 px-5 py-4 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="earnings-modal-title" className="truncate text-lg font-bold">
                {row.company_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                {row.quarter_label ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">
                    {row.quarter_label}
                  </span>
                ) : null}
                <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">
                  {titleCaseResultType(row.result_type)}
                </span>
                {row.nse_symbol ? (
                  <span className="rounded-full bg-white/15 px-2 py-0.5">{row.nse_symbol}</span>
                ) : null}
              </div>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close details"
              className="shrink-0 rounded-full bg-white/15 p-1.5 text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {/* Period grid */}
          <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Metric (₹ Cr)
                  </th>
                  <PeriodHeader label="Current" date={row.period_end} />
                  <PeriodHeader label="Prev Qtr" date={row.prev_quarter_end} />
                  <PeriodHeader label="Year ago" date={row.year_ago_quarter_end} />
                </tr>
              </thead>
              <tbody>
                <ValueRow
                  name="Revenue"
                  cur={row.revenue_cur_cr}
                  prev={row.revenue_prevq_cr}
                  yr={row.revenue_yrago_cr}
                />
                <ValueRow
                  name="Net Profit"
                  cur={row.net_profit_cur_cr}
                  prev={row.net_profit_prevq_cr}
                  yr={row.net_profit_yrago_cr}
                />
                <ValueRow
                  name="EBITDA"
                  cur={row.ebitda_cur_cr}
                  prev={row.ebitda_prevq_cr}
                  yr={row.ebitda_yrago_cr}
                />
                <ValueRow
                  name="EBITDA Margin"
                  cur={row.ebitda_margin_pct}
                  prev={row.ebitda_margin_qoq_pct}
                  yr={row.ebitda_margin_yoy_pct}
                  isPct
                />
              </tbody>
            </table>
          </div>

          {/* Change summary */}
          <div className="rounded-2xl bg-slate-50/70 px-4 py-3 ring-1 ring-slate-200/70">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Change
            </div>
            <div className="divide-y divide-slate-200/70">
              <ChangeRow name="Revenue">
                <ChangeBadge label="YoY" pct={row.revenue_yoy_pct} />
                <ChangeBadge label="QoQ" pct={row.revenue_qoq_pct} />
              </ChangeRow>
              <ChangeRow name="Net Profit">
                <ChangeBadge label="YoY" pct={row.net_profit_yoy_pct} swing={row.net_profit_swing} />
                <ChangeBadge label="QoQ" pct={row.net_profit_qoq_pct} />
              </ChangeRow>
              <ChangeRow name="EBITDA">
                <ChangeBadge label="YoY" pct={row.ebitda_yoy_pct} />
                <ChangeBadge label="QoQ" pct={row.ebitda_qoq_pct} />
              </ChangeRow>
              <ChangeRow name="EBITDA Margin">
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
              </ChangeRow>
            </div>
          </div>

          {/* Meta + provenance */}
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Filed
              </div>
              <div className="text-slate-700">{formatDateTime(row.filed_at)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Result type
              </div>
              <div className="text-slate-700">{titleCaseResultType(row.result_type)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Reporting unit
              </div>
              <div className="text-slate-700">{unit}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge tone="brand">Evidence-backed</Badge>
              <span>
                Model: <span className="font-medium text-slate-700">{row.extraction_model ?? "—"}</span>
              </span>
              <span>
                Confidence: <span className="font-medium text-slate-700">{conf}</span>
              </span>
            </div>
            {row.attachment_url ? (
              <a
                href={row.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M14 3v4a1 1 0 0 0 1 1h4M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7l-4-4Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                Open source filing (PDF)
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
