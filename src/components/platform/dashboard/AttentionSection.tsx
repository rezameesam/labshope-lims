import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type AttentionItem = {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  toneClass: string;
};

interface Props {
  items: AttentionItem[];
  onNavigate: (href: string) => void;
}

export const AttentionSection = ({ items, onNavigate }: Props) => (
  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Needs Attention</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-950">Today's priorities</h3>
      </div>
      <p className="max-w-xl text-sm leading-7 text-slate-600">
        This is the shortest path to action. If something is here, it still blocks sales, launch, or domain go-live.
      </p>
    </div>

    {items.length === 0 ? (
      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-950">Queue is clear</p>
          <p className="mt-1 text-sm text-slate-600">
            No open leads, pending provisioning, or unresolved domains right now.
          </p>
        </div>
      </div>
    ) : (
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className={`rounded-2xl border p-5 ${item.toneClass}`}>
            <p className="text-lg font-semibold text-slate-950">{item.title}</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{item.detail}</p>
            <Button
              variant="outline"
              className="mt-4 border-slate-300 bg-white"
              onClick={() => onNavigate(item.href)}
            >
              {item.actionLabel}
            </Button>
          </div>
        ))}
      </div>
    )}
  </section>
);
