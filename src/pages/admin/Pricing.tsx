import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

export default function Pricing() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.prices.useQuery();
  const update = trpc.admin.updatePrice.useMutation({
    onSuccess: () => { utils.admin.prices.invalidate(); toast.success("Price updated — live on the website"); },
  });
  const cats = [...new Set((data ?? []).map((r) => r.category))];
  return (
    <div>
      <h1 className="font-serif text-3xl text-ink mb-2">Repair Pricing</h1>
      <p className="text-sm text-ink/50 mb-7">Edit a price label and it updates on the public pricing page instantly. Use “Call us for pricing” where cost varies by model.</p>
      <div className="space-y-6">
        {cats.map((c) => (
          <div key={c} className="bg-white rounded-2xl border border-blush overflow-hidden">
            <h2 className="px-5 py-4 font-serif text-lg capitalize bg-blush-light border-b border-blush">{c}s</h2>
            <table className="w-full text-sm">
              <tbody>
                {(data ?? []).filter((r) => r.category === c).map((r) => (
                  <tr key={r.id} className="border-b border-blush/40 last:border-0 hover:bg-blush-light/40">
                    <td className="px-5 py-3 font-medium w-1/3">{r.brand}</td>
                    <td className="px-5 py-3 text-ink/55 w-1/3">{r.service}</td>
                    <td className="px-5 py-3">
                      <input defaultValue={r.priceLabel}
                        onBlur={(e) => e.target.value !== r.priceLabel && e.target.value && update.mutate({ id: r.id, priceLabel: e.target.value })}
                        className="w-full max-w-[220px] border border-ink/15 rounded-lg px-3 py-2 text-sm bg-ivory focus:outline-none focus:border-burgundy" />
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
