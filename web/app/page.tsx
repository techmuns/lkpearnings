import { getEarnings } from "@/lib/earnings";
import { EarningsExplorer } from "@/components/EarningsExplorer";
import { StatTile } from "@/components/StatTile";
import { LiveBadge } from "@/components/Badge";
import { formatDate } from "@/lib/format";

// Read D1 per request (never statically prerender the dashboard).
export const dynamic = "force-dynamic";

const G = {
  brand: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)",
  sky: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)",
  violet: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
  emerald: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
};

export default async function Page() {
  const { rows, live } = await getEarnings();
  const nowIso = new Date().toISOString();

  const total = rows.length;
  const companies = new Set(rows.map((r) => r.company_name)).size;
  const latestFiled = rows.reduce<string | null>((acc, r) => {
    if (!r.filed_at) return acc;
    return acc === null || r.filed_at > acc ? r.filed_at : acc;
  }, null);
  const profitable = rows.filter(
    (r) => typeof r.net_profit_cr === "number" && r.net_profit_cr > 0,
  ).length;
  const lossmaking = rows.filter(
    (r) => typeof r.net_profit_cr === "number" && r.net_profit_cr < 0,
  ).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600">
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black tracking-tight text-white shadow-lg ring-1 ring-white/20"
                style={{ background: "linear-gradient(135deg, #38bdf8 0%, #1d4ed8 55%, #1e3a8a 100%)" }}
                aria-hidden="true"
              >
                LKP
              </div>
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">Earnings Tracker</h1>
                <p className="text-sm font-medium text-brand-100">
                  LKP Securities · BSE Quarterly Financial Results
                </p>
              </div>
            </div>
            <LiveBadge live={live} />
          </div>
        </div>
        <div className="h-1 w-full bg-gradient-to-r from-sky-400 via-sky-300 to-transparent" />
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* KPI stat tiles — overlap the header band */}
        <section aria-label="Summary statistics" className="-mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Results tracked"
            value={total}
            sub="quarterly results extracted"
            gradient={G.brand}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            }
          />
          <StatTile
            label="Companies covered"
            value={companies}
            sub="distinct listed companies"
            gradient={G.sky}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M12 21V10a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v11M3 21h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 9h2M7 13h2M15 13h1M15 17h1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            }
          />
          <StatTile
            label="Latest filing"
            value={<span className="text-xl">{latestFiled ? formatDate(latestFiled) : "—"}</span>}
            sub="most recent result filed"
            gradient={G.violet}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            }
          />
          <StatTile
            label="Profit / Loss"
            value={
              <span>
                <span className="text-emerald-600">{profitable}</span>
                <span className="mx-1 text-slate-300">/</span>
                <span className="text-rose-500">{lossmaking}</span>
              </span>
            }
            sub={
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> profitable
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> loss-making
                </span>
              </span>
            }
            gradient={G.emerald}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 15l5-5 3 3 7-7M20 6v5m0-5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </section>

        <div className="mt-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-800">Latest Results</h2>
            <p className="text-sm text-slate-500">
              Newest first · each number links back to the original BSE filing
            </p>
          </div>
          <EarningsExplorer rows={rows} nowIso={nowIso} />
        </div>
      </main>

      <footer className="border-t border-slate-200/70 bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black text-white"
                style={{ background: "linear-gradient(135deg, #38bdf8 0%, #1d4ed8 55%, #1e3a8a 100%)" }}
                aria-hidden="true"
              >
                LKP
              </div>
              <span>
                <span className="font-semibold text-slate-700">Earnings Tracker</span> — LKP Securities
              </span>
            </div>
            <p className="text-xs text-slate-400">Auto-updated twice daily from BSE filings.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
