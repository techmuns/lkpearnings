"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { EarningsRow } from "@/lib/earnings";
import { daysSince, formatCrore, formatDate, formatPct, titleCaseResultType } from "@/lib/format";
import { exportEarningsToExcel } from "@/lib/excel";
import { ChangeBadge, MarginCompareBadge } from "./Badge";
import { Card } from "./Card";
import { EarningsTable } from "./EarningsTable";
import { EarningsModal } from "./EarningsModal";

type ResultFilter = "standalone" | "consolidated" | "all";
type PLFilter = "all" | "profit" | "loss";
type DateFilter = "all" | "7" | "30" | "90" | "365";
type ViewMode = "table" | "cards";

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-xl bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              active
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </span>
  );
}

function EarningsCards({
  rows,
  onSelect,
}: {
  rows: EarningsRow[];
  onSelect: (r: EarningsRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        return (
          <Card
            key={row.dedup_key}
            className="cursor-pointer overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <button
              onClick={() => onSelect(row)}
              className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={`View details for ${row.company_name}`}
            >
              <div className="h-1 w-full bg-gradient-to-r from-brand-500 to-sky-400" aria-hidden="true" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{row.company_name}</div>
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
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <CardMetric
                    label="Revenue"
                    value={formatCrore(row.revenue_cr)}
                    yoy={row.revenue_yoy_pct}
                    qoq={row.revenue_qoq_pct}
                  />
                  <CardMetric
                    label="Net Profit"
                    value={formatCrore(row.net_profit_cr)}
                    yoy={row.net_profit_yoy_pct}
                    qoq={row.net_profit_qoq_pct}
                    swing={row.net_profit_swing}
                  />
                  <CardMetric
                    label="EBITDA"
                    value={formatCrore(row.ebitda_cr)}
                    yoy={row.ebitda_yoy_pct}
                    qoq={row.ebitda_qoq_pct}
                  />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      EBITDA Margin
                    </div>
                    <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-800">
                      {formatPct(row.ebitda_margin_pct)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
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
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span>Filed {formatDate(row.filed_at)}</span>
                  <span className="font-semibold text-brand-600">View details →</span>
                </div>
              </div>
            </button>
          </Card>
        );
      })}
    </div>
  );
}

function CardMetric({
  label,
  value,
  yoy,
  qoq,
  swing = null,
}: {
  label: string;
  value: string;
  yoy: number | null;
  qoq: number | null;
  swing?: string | null;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-800">{value}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <ChangeBadge label="YoY" pct={yoy} swing={swing} />
        <ChangeBadge label="QoQ" pct={qoq} />
      </div>
    </div>
  );
}

export function EarningsExplorer({
  rows,
  nowIso,
}: {
  rows: EarningsRow[];
  nowIso: string;
}) {
  const [resultType, setResultType] = useState<ResultFilter>("standalone");
  const [quarter, setQuarter] = useState<string>("all");
  const [dateFiled, setDateFiled] = useState<DateFilter>("all");
  const [pl, setPl] = useState<PLFilter>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<EarningsRow | null>(null);

  const quarters = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.quarter_label) set.add(r.quarter_label);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (resultType !== "all" && r.result_type !== resultType) return false;
      if (quarter !== "all" && r.quarter_label !== quarter) return false;
      if (dateFiled !== "all") {
        const d = daysSince(r.filed_at, nowIso);
        if (d === null || d > parseInt(dateFiled, 10)) return false;
      }
      if (pl === "profit" && !(typeof r.net_profit_cr === "number" && r.net_profit_cr > 0))
        return false;
      if (pl === "loss" && !(typeof r.net_profit_cr === "number" && r.net_profit_cr < 0))
        return false;
      return true;
    });
  }, [rows, resultType, quarter, dateFiled, pl, nowIso]);

  const isDefault =
    resultType === "standalone" &&
    quarter === "all" &&
    dateFiled === "all" &&
    pl === "all";

  const clear = () => {
    setResultType("standalone");
    setQuarter("all");
    setDateFiled("all");
    setPl("all");
  };

  return (
    <section aria-label="Earnings results">
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <FieldLabel>Result type</FieldLabel>
            <Segmented<ResultFilter>
              ariaLabel="Filter by result type"
              value={resultType}
              onChange={setResultType}
              options={[
                { value: "standalone", label: "Standalone" },
                { value: "consolidated", label: "Consolidated" },
                { value: "all", label: "All" },
              ]}
            />
          </div>

          <div>
            <FieldLabel>Quarter</FieldLabel>
            <select
              aria-label="Filter by quarter"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="rounded-xl border-0 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="all">All quarters</option>
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Date filed</FieldLabel>
            <select
              aria-label="Filter by date filed"
              value={dateFiled}
              onChange={(e) => setDateFiled(e.target.value as DateFilter)}
              className="rounded-xl border-0 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </div>

          <div>
            <FieldLabel>Profit / Loss</FieldLabel>
            <Segmented<PLFilter>
              ariaLabel="Filter by profit or loss"
              value={pl}
              onChange={setPl}
              options={[
                { value: "all", label: "All" },
                { value: "profit", label: "Profit" },
                { value: "loss", label: "Loss" },
              ]}
            />
          </div>

          <div className="ml-auto flex items-end gap-3">
            <Segmented<ViewMode>
              ariaLabel="Toggle view"
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: "Table" },
                { value: "cards", label: "Cards" },
              ]}
            />
            <button
              onClick={() => exportEarningsToExcel(filtered)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Export current results to Excel"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Export
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-800">{filtered.length}</span> of{" "}
            <span className="font-semibold text-slate-700">{rows.length}</span> results
          </span>
          {!isDefault ? (
            <button
              onClick={clear}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-4xl">🔍</div>
          <p className="mt-3 font-semibold text-slate-700">No results match these filters</p>
          <p className="mt-1 text-sm text-slate-500">
            Try widening the date range or switching result type.
          </p>
          {!isDefault ? (
            <button
              onClick={clear}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Clear filters
            </button>
          ) : null}
        </Card>
      ) : view === "table" ? (
        <EarningsTable rows={filtered} onRowClick={setSelected} />
      ) : (
        <EarningsCards rows={filtered} onSelect={setSelected} />
      )}

      {selected ? <EarningsModal row={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
