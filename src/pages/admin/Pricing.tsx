import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

const input =
  "border border-ink/15 rounded-lg px-3 py-2 text-sm bg-ivory focus:outline-none focus:border-burgundy";

export default function Pricing() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.prices.useQuery();

  const refresh = () => {
    void utils.admin.prices.invalidate();
    // The public pricing page reads shop.prices — refresh it too.
    void utils.shop.prices.invalidate();
  };

  const update = trpc.admin.updatePrice.useMutation({
    onSuccess: () => { refresh(); toast.success("Price updated — live on the website"); },
    onError: (e) => toast.error(e.message),
  });

  const create = trpc.admin.createPrice.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Added — it is live on the pricing page now");
      setForm({ category: "", brand: "", service: "", priceLabel: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.admin.deletePrice.useMutation({
    onSuccess: () => { refresh(); toast.success("Removed from the price list"); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({ category: "", brand: "", service: "", priceLabel: "" });
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const rows = data ?? [];
  const cats = [...new Set(rows.map((r) => r.category))];
  const brands = [...new Set(rows.map((r) => r.brand))];
  const services = [...new Set(rows.map((r) => r.service))];

  const canAdd =
    form.category.trim() && form.brand.trim() && form.service.trim() && form.priceLabel.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    create.mutate({
      category: form.category,
      brand: form.brand,
      service: form.service,
      priceLabel: form.priceLabel,
    });
  };

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink mb-2">Repair Pricing</h1>
      <p className="text-sm text-ink/50 mb-7">
        Add a model or repair below and it appears on the public pricing page immediately. Edit a
        price inline, or use “Call us for pricing” where cost varies by model.
      </p>

      {/* ---------- add a new model / repair ---------- */}
      <div className="bg-white rounded-2xl border border-blush p-6 mb-8">
        <h2 className="font-serif text-lg mb-1 flex items-center gap-2">
          <Plus size={18} className="text-burgundy" /> Add a model or repair
        </h2>
        <p className="text-xs text-ink/45 mb-5">
          Category, brand and repair are free text — type a new one and it becomes a new section or
          model on the website.
        </p>
        <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Category</label>
            <input list="price-cats" value={form.category} required
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="smartphone" className={`${input} w-full`} />
            <datalist id="price-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Brand / Model</label>
            <input list="price-brands" value={form.brand} required
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="iPhone 17" className={`${input} w-full`} />
            <datalist id="price-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Repair</label>
            <input list="price-services" value={form.service} required
              onChange={(e) => setForm({ ...form, service: e.target.value })}
              placeholder="Screen Replacement" className={`${input} w-full`} />
            <datalist id="price-services">{services.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Price</label>
            <input value={form.priceLabel} required
              onChange={(e) => setForm({ ...form, priceLabel: e.target.value })}
              placeholder="From $129" className={`${input} w-full`} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={!canAdd || create.isPending}
              className="bg-burgundy text-ivory text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-burgundy-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {create.isPending ? "Adding…" : "Add to price list"}
            </button>
          </div>
        </form>
      </div>

      {/* ---------- existing price list ---------- */}
      {cats.length === 0 && (
        <p className="text-sm text-ink/40 bg-white rounded-2xl border border-blush p-8 text-center">
          No prices yet — add your first one above.
        </p>
      )}

      <div className="space-y-6">
        {cats.map((c) => (
          <div key={c} className="bg-white rounded-2xl border border-blush overflow-hidden">
            <h2 className="px-5 py-4 font-serif text-lg capitalize bg-blush-light border-b border-blush">{c}s</h2>
            <table className="w-full text-sm">
              <tbody>
                {rows.filter((r) => r.category === c).map((r) => (
                  <tr key={r.id} className="border-b border-blush/40 last:border-0 hover:bg-blush-light/40">
                    <td className="px-5 py-3 font-medium w-1/3">{r.brand}</td>
                    <td className="px-5 py-3 text-ink/55 w-1/3">{r.service}</td>
                    <td className="px-5 py-3">
                      <input defaultValue={r.priceLabel}
                        onBlur={(e) => e.target.value !== r.priceLabel && e.target.value && update.mutate({ id: r.id, priceLabel: e.target.value })}
                        className="w-full max-w-[200px] border border-ink/15 rounded-lg px-3 py-2 text-sm bg-ivory focus:outline-none focus:border-burgundy" />
                    </td>
                    <td className="px-5 py-3 text-right w-[90px]">
                      {confirmId === r.id ? (
                        <span className="flex items-center gap-2 justify-end">
                          <button onClick={() => { remove.mutate({ id: r.id }); setConfirmId(null); }}
                            className="text-[11px] font-semibold text-destructive hover:underline">Delete</button>
                          <button onClick={() => setConfirmId(null)}
                            className="text-[11px] text-ink/45 hover:underline">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(r.id)} aria-label={`Delete ${r.brand} ${r.service}`}
                          className="text-ink/30 hover:text-destructive transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
