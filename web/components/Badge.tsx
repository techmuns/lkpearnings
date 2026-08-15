import type { ReactNode } from "react";
import { formatChangePct, type Tone } from "@/lib/format";

type BadgeTone = "brand" | "green" | "red" | "amber" | "slate" | "sky" | "violet";

const TONE: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

function Arrow({ dir }: { dir: "up" | "down" }) {
  return dir === "up" ? (
    <svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true" className="shrink-0">
      <path d="M4 0.5 L7.5 6.5 L0.5 6.5 Z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true" className="shrink-0">
      <path d="M4 7.5 L0.5 1.5 L7.5 1.5 Z" fill="currentColor" />
    </svg>
  );
}

const CHANGE_TEXT: Record<Tone, string> = {
  up: "text-emerald-600",
  down: "text-rose-500",
  flat: "text-slate-400",
  none: "text-slate-300",
};

/**
 * A quiet YoY/QoQ change indicator: muted label + arrow + magnitude, colored by
 * sign — no filled background (keeps a dense table calm). If `swing` is set
 * (net-profit sign flip) it shows the turnaround label instead of a %.
 */
export function ChangeBadge({
  label,
  pct,
  swing = null,
}: {
  label: string;
  pct: number | null | undefined;
  swing?: string | null;
}) {
  if (swing === "loss->profit" || swing === "profit->loss") {
    const up = swing === "loss->profit";
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium"
        title={`${label}: ${up ? "Loss to Profit" : "Profit to Loss"}`}
      >
        <span className="text-[10px] font-medium text-slate-400">{label}</span>
        <span className={up ? "text-emerald-600" : "text-rose-500"}>
          {up ? "Loss→Profit" : "Profit→Loss"}
        </span>
      </span>
    );
  }

  const tone: Tone =
    typeof pct !== "number" || !Number.isFinite(pct)
      ? "none"
      : pct > 0.05
        ? "up"
        : pct < -0.05
          ? "down"
          : "flat";

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" title={`${label} change`}>
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <span className={`inline-flex items-center gap-0.5 tabular-nums ${CHANGE_TEXT[tone]}`}>
        {tone === "up" && <Arrow dir="up" />}
        {tone === "down" && <Arrow dir="down" />}
        {formatChangePct(pct)}
      </span>
    </span>
  );
}

/**
 * Margin comparison indicator: shows a comparison-period margin LEVEL with an
 * arrow for whether the current margin is higher (green) or lower (red).
 */
export function MarginCompareBadge({
  label,
  current,
  compare,
}: {
  label: string;
  current: number | null | undefined;
  compare: number | null | undefined;
}) {
  const hasBoth =
    typeof current === "number" &&
    Number.isFinite(current) &&
    typeof compare === "number" &&
    Number.isFinite(compare);
  const tone: Tone = !hasBoth
    ? "none"
    : current! - compare! > 0.05
      ? "up"
      : current! - compare! < -0.05
        ? "down"
        : "flat";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" title={`${label} margin`}>
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <span className={`inline-flex items-center gap-0.5 tabular-nums ${CHANGE_TEXT[tone]}`}>
        {tone === "up" && <Arrow dir="up" />}
        {tone === "down" && <Arrow dir="down" />}
        {typeof compare === "number" && Number.isFinite(compare) ? `${compare.toFixed(1)}%` : "—"}
      </span>
    </span>
  );
}

export function LiveBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/30 backdrop-blur">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/30 backdrop-blur">
      <span className="h-2 w-2 rounded-full bg-amber-300" />
      Demo data
    </span>
  );
}
