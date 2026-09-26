import { Fragment, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Trash2, Plus, ChevronDown, Upload, ClipboardList } from "lucide-react";
import { matchingProducts, summarizeStock } from "@/lib/brandStock";
import { productImageUrl } from "@/lib/productImages";
import { parsePriceRows, partitionNewRows, type ParsedPriceRow } from "@/lib/priceImport";

const input =
  "border border-ink/15 rounded-lg px-3 py-2 text-sm bg-ivory focus:outline-none focus:border-burgundy";

const money = (cents: number) => "$" + (cents / 100).toFixed(2);

/** Example showing the accepted shape — doubles as the empty-state hint. */
const IMPORT_PLACEHOLDER = `category | brand | service | price
ipad | iPad | Screen Replacement | From $220
ipad | iPad Mini | Screen Replacement | From $220
ipad | iPad Air | Screen Replacement | From $250
ipad | iPad Pro 11 | Screen Replacement | From $280
ipad | iPad Pro 12.9 | Screen Replacement | From $300`;

export default function Pricing() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.prices.useQuery();
  // Read-only here: this page shows what is in stock, it does not edit stock.
  const { data: products } = trpc.admin.products.useQuery();

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

  const bulk = trpc.admin.createPrices.useMutation({
    onSuccess: (result) => {
      refresh();
      setImportResult(result);
      setImportText("");
      toast.success(
        result.created > 0
          ? `Added ${result.created} price row${result.created === 1 ? "" : "s"}`
          : "Nothing to add — every row already exists",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({ category: "", brand: "", service: "", priceLabel: "" });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  // Which price rows are drilled into, keyed by row id.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Hidden products still count as stock you own, so they are shown but flagged.
  const [showHidden, setShowHidden] = useState(false);
  // Bulk import
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; total: number } | null>(null);

  // Memoised so the import preview below does not re-diff on every render.
  const rows = useMemo(() => data ?? [], [data]);
  const cats = [...new Set(rows.map((r) => r.category))];
  const brands = [...new Set(rows.map((r) => r.brand))];
  const services = [...new Set(rows.map((r) => r.service))];

  // Live preview: parse and diff the paste before anything is written, so a
  // mistake is visible as a count rather than discovered on the public site.
  const preview = useMemo(() => {
    const parsed = parsePriceRows(importText);
    const { fresh, duplicates } = partitionNewRows(parsed.rows, rows);
    return { ...parsed, fresh, duplicates };
  }, [importText, rows]);

  const catalogue = useMemo(
    () => (products ?? []).filter((p) => showHidden || p.active),
    [products, showHidden],
  );

  const toggleRow = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

      {/* ---------- bulk import ---------- */}
      <div className="bg-white rounded-2xl border border-blush p-6 mb-8">
        <h2 className="font-serif text-lg mb-1 flex items-center gap-2">
          <ClipboardList size={18} className="text-burgundy" /> Add many prices at once
        </h2>
        <p className="text-xs text-ink/45 mb-4">
          Paste rows, or upload a <span className="font-mono">.csv</span> /{" "}
          <span className="font-mono">.txt</span> file. One row per line:{" "}
          <span className="font-mono">category | brand | service | price</span>. A header row is
          optional; tab- and comma-separated work too. Rows that already exist are skipped, so
          importing the same block twice changes nothing.
        </p>

        <textarea
          value={importText}
          onChange={(e) => { setImportText(e.target.value); setImportResult(null); }}
          rows={8}
          spellCheck={false}
          placeholder={IMPORT_PLACEHOLDER}
          className={`${input} w-full font-mono text-[12.5px] resize-y`}
        />

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <label className="inline-flex items-center gap-2 text-[12.5px] text-ink/55 cursor-pointer hover:text-burgundy">
            <Upload size={14} /> Load a file
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportText(await file.text());
                setImportResult(null);
                e.target.value = "";
              }} />
          </label>

          <button
            type="button"
            disabled={preview.fresh.length === 0 || bulk.isPending}
            onClick={() =>
              bulk.mutate({
                rows: preview.fresh.map((row: ParsedPriceRow) => ({
                  category: row.category,
                  brand: row.brand,
                  service: row.service,
                  priceLabel: row.priceLabel,
                })),
              })
            }
            className="bg-burgundy text-ivory text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-burgundy-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulk.isPending
              ? "Importing…"
              : preview.fresh.length === 0
                ? "Import rows"
                : `Import ${preview.fresh.length} row${preview.fresh.length === 1 ? "" : "s"}`}
          </button>

          {importText.trim() !== "" && (
            <>
              <span className="text-[12.5px] text-ink/55">
                {preview.rows.length} parsed
                {preview.fresh.length > 0 && <> · <span className="text-emerald-700 font-semibold">{preview.fresh.length} new</span></>}
                {preview.duplicates.length > 0 && <> · {preview.duplicates.length} already present</>}
                {preview.issues.length > 0 && <> · <span className="text-red-600 font-semibold">{preview.issues.length} problem{preview.issues.length === 1 ? "" : "s"}</span></>}
              </span>
              <button type="button" onClick={() => { setImportText(""); setImportResult(null); }}
                className="text-[12.5px] text-ink/45 hover:text-destructive">Clear</button>
            </>
          )}
        </div>

        {preview.issues.length > 0 && (
          <ul className="mt-4 space-y-1.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">
            {preview.issues.slice(0, 12).map((issue, i) => (
              <li key={i} className="text-[12px] text-red-700">
                <span className="font-semibold">Line {issue.line}:</span> {issue.message}
              </li>
            ))}
            {preview.issues.length > 12 && (
              <li className="text-[12px] text-red-700">…and {preview.issues.length - 12} more.</li>
            )}
            <li className="text-[11.5px] text-red-700/70 pt-1">
              Rows with problems are left out; the rest will still import.
            </li>
          </ul>
        )}

        {preview.fresh.length > 0 && (
          <div className="mt-4 border border-blush rounded-xl overflow-hidden">
            <p className="text-[11px] uppercase tracking-[0.15em] text-ink/40 px-3.5 py-2.5 bg-blush-light/60">
              Will be added
            </p>
            <div className="max-h-56 overflow-y-auto divide-y divide-blush/50">
              {preview.fresh.map((row, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]">
                  <span className="font-mono text-ink/40 w-16 shrink-0">{row.category}</span>
                  <span className="font-medium flex-1 min-w-0 truncate">{row.brand}</span>
                  <span className="text-ink/50 flex-1 min-w-0 truncate">{row.service}</span>
                  <span className="font-semibold text-burgundy shrink-0">{row.priceLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {importResult && (
          <p className="mt-4 text-[12.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
            Imported {importResult.created} of {importResult.total} row
            {importResult.total === 1 ? "" : "s"}
            {importResult.skipped > 0 && ` — ${importResult.skipped} already existed and ${importResult.skipped === 1 ? "was" : "were"} left untouched`}
            . They are live on the pricing page now.
          </p>
        )}
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
            <div className="flex items-center justify-between gap-3 px-5 py-4 bg-blush-light border-b border-blush">
              <h2 className="font-serif text-lg capitalize">{c}s</h2>
              <label className="flex items-center gap-2 text-[11px] text-ink/50 cursor-pointer">
                <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)}
                  className="accent-burgundy w-3.5 h-3.5" />
                Include hidden products
              </label>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {rows.filter((r) => r.category === c).map((r) => {
                  const matched = matchingProducts(r.brand, catalogue);
                  const stock = summarizeStock(matched);
                  const isOpen = expanded.has(r.id);
                  const panelId = `stock-${r.id}`;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => toggleRow(r.id)}
                        className={`border-b border-blush/40 cursor-pointer transition-colors ${isOpen ? "bg-blush-light/70" : "hover:bg-blush-light/40"}`}
                      >
                        <td className="px-5 py-3 font-medium w-1/3">
                          <span className="flex items-center gap-2">
                            <ChevronDown size={15}
                              className={`text-ink/40 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleRow(r.id); }}
                              aria-expanded={isOpen}
                              aria-controls={panelId}
                              className="text-left hover:text-burgundy hover:underline decoration-dotted underline-offset-4"
                            >
                              {r.brand}
                            </button>
                            {stock.matched > 0 && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stock.inStock > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}
                                title={`${stock.matched} matching product(s)`}>
                                {stock.totalUnits} in stock
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-ink/55 w-1/3">{r.service}</td>
                        <td className="px-5 py-3">
                          <input defaultValue={r.priceLabel}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => e.target.value !== r.priceLabel && e.target.value && update.mutate({ id: r.id, priceLabel: e.target.value })}
                            className="w-full max-w-[200px] border border-ink/15 rounded-lg px-3 py-2 text-sm bg-ivory focus:outline-none focus:border-burgundy" />
                        </td>
                        <td className="px-5 py-3 text-right w-[90px]">
                          {confirmId === r.id ? (
                            <span className="flex items-center gap-2 justify-end">
                              <button onClick={(e) => { e.stopPropagation(); remove.mutate({ id: r.id }); setConfirmId(null); }}
                                className="text-[11px] font-semibold text-destructive hover:underline">Delete</button>
                              <button onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                                className="text-[11px] text-ink/45 hover:underline">Cancel</button>
                            </span>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); setConfirmId(r.id); }} aria-label={`Delete ${r.brand} ${r.service}`}
                              className="text-ink/30 hover:text-destructive transition-colors">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr id={panelId} className="border-b border-blush/40 bg-blush-light/25">
                          <td colSpan={4} className="px-5 py-4">
                            {stock.matched === 0 ? (
                              <p className="text-[12.5px] text-ink/50">
                                No products in the shop match <span className="font-semibold">{r.brand}</span>.
                                Add or rename a product under <span className="font-semibold">Products</span> so its name starts
                                with “{r.brand}”, and its stock will appear here.
                              </p>
                            ) : (
                              <>
                                <p className="text-[11px] uppercase tracking-[0.15em] text-ink/40 mb-3">
                                  {stock.matched} product{stock.matched === 1 ? "" : "s"} · {stock.totalUnits} unit
                                  {stock.totalUnits === 1 ? "" : "s"} in stock
                                  {stock.soldOut > 0 ? ` · ${stock.soldOut} sold out` : ""}
                                </p>
                                <div className="space-y-2">
                                  {matched.map((p) => (
                                    <div key={p.id} className="flex items-center gap-3 bg-white rounded-xl border border-blush px-3 py-2">
                                      <div className="w-9 h-9 shrink-0 rounded-lg border border-blush bg-blush-light overflow-hidden grid place-items-center">
                                        {productImageUrl(p)
                                          ? <img src={productImageUrl(p)!} alt="" loading="lazy" className="w-full h-full object-cover" />
                                          : <span className="text-[9px] text-ink/30">none</span>}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-medium text-ink truncate">
                                          {p.name}
                                          {!p.active && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Hidden</span>}
                                        </p>
                                        <p className="text-[11px] text-ink/45">
                                          {p.subcategory} · {money(p.price)}
                                        </p>
                                      </div>
                                      <span className={`text-[12px] font-semibold shrink-0 px-2.5 py-1 rounded-full ${p.stock > 0 ? (p.stock <= 2 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800") : "bg-red-100 text-red-700"}`}>
                                        {p.stock > 0 ? `${p.stock} left` : "Sold out"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
