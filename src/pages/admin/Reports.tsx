import { trpc } from "@/providers/trpc";

const money = (c: number) => "$" + (c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function Reports() {
  const { data } = trpc.admin.reports.useQuery();
  if (!data) return <p className="text-ink/40">Loading reports…</p>;
  const maxMonth = Math.max(1, ...data.byMonth.map((m) => m.n));
  const maxType = Math.max(1, ...data.byType.map((t) => t.n));
  return (
    <div>
      <h1 className="font-serif text-3xl text-ink mb-8">Reports</h1>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Parts inventory value", v: money(data.inventoryValueCents) },
          { label: "Retail stock value", v: money(data.retailStockValueCents) },
          { label: "Newsletter subscribers", v: data.subscribers },
          { label: "Published blog posts", v: data.blogPosts },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-blush p-6">
            <p className="font-serif text-2xl">{c.v}</p><p className="text-xs text-ink/50 mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-blush p-6">
          <h2 className="font-serif text-xl mb-5">Bookings — last 6 months</h2>
          {data.byMonth.length === 0 ? <p className="text-sm text-ink/40">No data yet.</p> : (
            <div className="flex items-end gap-3 h-44">
              {data.byMonth.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs text-ink/50">{m.n}</span>
                  <div className="w-full bg-burgundy/85 rounded-t-lg" style={{ height: `${(m.n / maxMonth) * 100}%`, minHeight: 6 }} />
                  <span className="text-[11px] text-ink/45">{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-blush p-6">
          <h2 className="font-serif text-xl mb-5">Repairs by status</h2>
          <div className="space-y-3">
            {data.byStatus.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="capitalize">{s.status.replace("_", " ")}</span>
                <span className="font-semibold">{s.n}</span>
              </div>
            ))}
            {data.byStatus.length === 0 && <p className="text-sm text-ink/40">No data yet.</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-blush p-6">
          <h2 className="font-serif text-xl mb-5">Top repair types</h2>
          <div className="space-y-3">
            {data.byType.map((t) => (
              <div key={t.repairType} className="text-sm">
                <div className="flex justify-between mb-1"><span>{t.repairType}</span><span className="font-semibold">{t.n}</span></div>
                <div className="h-2 bg-blush rounded-full"><div className="h-full bg-burgundy rounded-full" style={{ width: `${(t.n / maxType) * 100}%` }} /></div>
              </div>
            ))}
            {data.byType.length === 0 && <p className="text-sm text-ink/40">No data yet.</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-blush p-6">
          <h2 className="font-serif text-xl mb-5">Top devices</h2>
          <div className="space-y-3">
            {data.byDevice.map((d) => (
              <div key={d.device} className="flex items-center justify-between text-sm border-b border-blush/50 pb-2.5">
                <span>{d.device}</span><span className="font-semibold">{d.n}</span>
              </div>
            ))}
            {data.byDevice.length === 0 && <p className="text-sm text-ink/40">No data yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
