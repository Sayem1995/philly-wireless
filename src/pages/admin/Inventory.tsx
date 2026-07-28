import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";

type PartForm = { id?: number; name: string; sku: string; category: string; stock: number; lowStockAt: number; costCents: number };
const empty: PartForm = { name: "", sku: "", category: "Screens", stock: 0, lowStockAt: 5, costCents: 0 };

export default function Inventory() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.parts.useQuery();
  const [form, setForm] = useState<PartForm | null>(null);
  const upsert = trpc.admin.upsertPart.useMutation({ onSuccess: () => { utils.admin.parts.invalidate(); utils.admin.stats.invalidate(); setForm(null); toast.success("Part saved"); } });
  const del = trpc.admin.deletePart.useMutation({ onSuccess: () => { utils.admin.parts.invalidate(); toast.success("Part deleted"); } });
  const input = "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy w-full";
  const low = (data ?? []).filter((p) => p.stock <= p.lowStockAt);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif text-3xl text-ink">Parts Inventory</h1>
        <button onClick={() => setForm(empty)} className="bg-burgundy text-ivory text-sm font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 hover:bg-burgundy-dark"><Plus size={15} /> Add Part</button>
      </div>
      {low.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800 flex items-center gap-3">
          <AlertTriangle size={17} /> {low.length} part{low.length > 1 ? "s" : ""} at or below low-stock threshold: {low.map((p) => p.name).join(", ")}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-blush overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead><tr className="text-left text-[11px] tracking-[0.15em] uppercase text-ink/40 border-b border-blush">
            <th className="px-5 py-4">Part</th><th className="px-5 py-4">SKU</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Stock</th><th className="px-5 py-4">Cost</th><th className="px-5 py-4"></th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-blush/50 hover:bg-blush-light/50">
                <td className="px-5 py-3.5 font-medium">{p.name}</td>
                <td className="px-5 py-3.5 text-ink/50">{p.sku}</td>
                <td className="px-5 py-3.5">{p.category}</td>
                <td className="px-5 py-3.5">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${p.stock <= p.lowStockAt ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{p.stock}</span>
                </td>
                <td className="px-5 py-3.5">${(p.costCents / 100).toFixed(2)}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-2">
                    <button onClick={() => setForm({ id: p.id, name: p.name, sku: p.sku, category: p.category, stock: p.stock, lowStockAt: p.lowStockAt, costCents: p.costCents })} className="text-burgundy hover:bg-blush p-2 rounded-lg"><Pencil size={14} /></button>
                    <button onClick={() => confirm("Delete this part?") && del.mutate({ id: p.id })} className="text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center px-4" onClick={() => setForm(null)}>
          <div className="bg-ivory rounded-3xl p-8 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-2xl mb-2">{form.id ? "Edit part" : "Add part"}</h2>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Part name *" className={input} />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU *" className={input} />
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className={input} />
              <input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: +e.target.value })} placeholder="Stock" className={input} />
              <input type="number" min={0} value={form.lowStockAt} onChange={(e) => setForm({ ...form, lowStockAt: +e.target.value })} placeholder="Low-stock alert at" className={input} />
            </div>
            <input type="number" min={0} value={form.costCents / 100} onChange={(e) => setForm({ ...form, costCents: Math.round(+e.target.value * 100) })} placeholder="Unit cost ($)" className={input} />
            <button onClick={() => form.name && form.sku && upsert.mutate(form)} className="w-full bg-burgundy text-ivory font-semibold py-3 rounded-full hover:bg-burgundy-dark">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
