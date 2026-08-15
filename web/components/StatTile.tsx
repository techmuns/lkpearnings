import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatTile({
  label,
  value,
  sub,
  icon,
  gradient,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  gradient: string;
}) {
  return (
    <Card className="p-4 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ background: gradient }}
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="mt-0.5 truncate text-2xl font-bold text-slate-900">{value}</div>
          {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
        </div>
      </div>
    </Card>
  );
}
