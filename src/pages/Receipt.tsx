import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Logo from "@/components/Logo";
import { STORE } from "@contracts/constants";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Customer-facing receipt. Reachable only with the unguessable token from the
 * emailed link, so the link itself is the authorisation.
 */
export default function Receipt() {
  const { token = "" } = useParams();
  const { data, isLoading } = trpc.shop.receiptByToken.useQuery(
    { token },
    { enabled: token.length >= 10, retry: false },
  );

  if (isLoading) {
    return <p className="min-h-screen grid place-items-center bg-ivory text-ink/40">Loading receipt…</p>;
  }

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-ivory px-5 text-center">
        <div>
          <h1 className="font-serif text-2xl text-ink mb-3">Receipt not found</h1>
          <p className="text-ink/55 text-sm mb-6 max-w-sm">
            This link may have expired or been mistyped. Call us on {STORE.phone} and we'll send it again.
          </p>
          <Link to="/" className="text-burgundy font-semibold hover:underline">← Back to the website</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory py-10 px-5 print:py-0">
      <Seo title={`Receipt #PPR-R${data.id} — Philly Phone Repair`} />
      <div className="max-w-lg mx-auto">
        <div className="flex justify-center mb-6 print:hidden"><Logo /></div>

        <div className="bg-white border border-blush rounded-3xl p-8 shadow-sm print:border-0 print:shadow-none">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-blush">
            <div>
              <h1 className="font-serif text-2xl text-ink">Payment receipt</h1>
              <p className="text-xs text-ink/45 mt-1">#{`PPR-R${data.id}`}</p>
            </div>
            <div className="text-right text-xs text-ink/55 leading-relaxed">
              <p className="font-medium text-ink">{STORE.name}</p>
              <p>{STORE.address}</p>
              <p>{STORE.city}</p>
              <p>{STORE.phone}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-y-3 text-sm py-5 border-b border-blush">
            <dt className="text-ink/45">Customer</dt><dd className="text-right font-medium">{data.customerName}</dd>
            <dt className="text-ink/45">Device</dt><dd className="text-right font-medium">{data.device}</dd>
            <dt className="text-ink/45">Repair</dt><dd className="text-right font-medium">{data.repairType}</dd>
            <dt className="text-ink/45">Date paid</dt><dd className="text-right font-medium">{data.paidAt}</dd>
            <dt className="text-ink/45">Payment method</dt><dd className="text-right font-medium capitalize">{data.paymentMethod}</dd>
          </dl>

          <table className="w-full text-sm py-5">
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-b border-blush/50 last:border-0">
                  <td className="py-3 text-ink/70">{l.description}</td>
                  <td className="py-3 text-right font-medium">{money(l.amountCents)}</td>
                </tr>
              ))}
              {data.taxCents > 0 && (
                <tr className="border-b border-blush/50">
                  <td className="py-3 text-ink/70">Tax</td>
                  <td className="py-3 text-right font-medium">{money(data.taxCents)}</td>
                </tr>
              )}
              <tr>
                <td className="pt-4 font-serif text-lg text-ink">Total paid</td>
                <td className="pt-4 text-right font-serif text-2xl text-burgundy">{money(data.totalCents)}</td>
              </tr>
            </tbody>
          </table>

          {data.notes && <p className="text-xs text-ink/55 mt-4 leading-relaxed">{data.notes}</p>}

          <p className="text-[11.5px] text-ink/45 mt-6 pt-4 border-t border-blush leading-relaxed">
            Keep this receipt for your records — it also covers any warranty claim. Thank you for
            choosing {STORE.name}.
          </p>
        </div>

        <div className="flex justify-center gap-3 mt-6 print:hidden">
          <button onClick={() => window.print()}
            className="bg-burgundy text-ivory text-sm font-semibold px-6 py-3 rounded-full hover:bg-burgundy-dark transition-colors">
            Print / save as PDF
          </button>
          <Link to="/" className="border border-burgundy/30 text-burgundy text-sm font-semibold px-6 py-3 rounded-full hover:bg-blush transition-colors">
            Done
          </Link>
        </div>
      </div>
    </div>
  );
}
