import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { AlertTriangle, FolderOpen, Package, Pencil, Plus, Trash2 } from "lucide-react";

type Part = {
  id: number;
  name: string;
  sku: string;
  category: string;
  stock: number;
  lowStockAt: number;
  costCents: number;
};

type PartForm = Omit<Part, "id"> & { id?: number };

const empty: PartForm = {
  name: "",
  sku: "",
  category: "Screens",
  stock: 0,
  lowStockAt: 5,
  costCents: 0,
};

const SUGGESTED_CATEGORIES = [
  "Screens",
  "Batteries",
  "Ports",
  "Cameras",
  "Housings",
  "Speakers",
  "Buttons",
  "Boards",
  "Phones",
  "Tools",
  "Accessories",
];

const CATEGORY_ORDER = [
  "Screens",
  "Batteries",
  "Ports",
  "Cameras",
  "Housings",
  "Speakers",
  "Buttons",
  "Boards",
  "Phones",
  "Tools",
  "Accessories",
];

function groupOrder(name: string): number {
  const index = CATEGORY_ORDER.findIndex((entry) => entry.toLowerCase() === name.toLowerCase());
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Inventory() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.parts.useQuery();
  const [form, setForm] = useState<PartForm | null>(null);
  const upsert = trpc.admin.upsertPart.useMutation({
    onSuccess: () => {
      utils.admin.parts.invalidate();
      utils.admin.stats.invalidate();
      setForm(null);
      toast.success("Part saved");
    },
  });
  const del = trpc.admin.deletePart.useMutation({
    onSuccess: () => {
      utils.admin.parts.invalidate();
      toast.success("Part deleted");
    },
  });
  const input = "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy w-full";
  const parts = (data ?? []) as Part[];
  const low = parts.filter((part) => part.stock <= part.lowStockAt);

  const byCategory = new Map<string, Part[]>();
  for (const part of parts) {
    const category = part.category.trim() || "Uncategorized";
    const current = byCategory.get(category) ?? [];
    current.push(part);
    byCategory.set(category, current);
  }
  const groups = Array.from(byCategory.entries())
    .map(([name, entries]) => ({
      name,
      parts: entries.slice().sort((a, b) => a.name.localeCompare(b.name)),
      units: entries.reduce((sum, part) => sum + part.stock, 0),
      valueCents: entries.reduce((sum, part) => sum + part.stock * part.costCents, 0),
      lowCount: entries.filter((part) => part.stock <= part.lowStockAt).length,
    }))
    .sort((a, b) => groupOrder(a.name) - groupOrder(b.name) || a.name.localeCompare(b.name));

  const categoryOptions = Array.from(
    new Set([...SUGGESTED_CATEGORIES, ...groups.map((group) => group.name)]),
  );

  const openNew = (category = "Screens") => setForm({ ...empty, category });
  const openEdit = (part: Part) =>
    setForm({
      id: part.id,
      name: part.name,
      sku: part.sku,
      category: part.category,
      stock: part.stock,
      lowStockAt: part.lowStockAt,
      costCents: part.costCents,
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Parts Inventory</h1>
          <p className="mt-1 text-xs text-ink/45">
            {parts.length} parts across {groups.length} categor{groups.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <button
          onClick={() => openNew()}
          className="bg-burgundy text-ivory text-sm font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 hover:bg-burgundy-dark"
        >
          <Plus size={15} /> Add Part
        </button>
      </div>

      {low.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800 flex items-center gap-3">
          <AlertTriangle size={17} /> {low.length} part{low.length > 1 ? "s" : ""} at or below
          low-stock threshold: {low.map((part) => part.name).join(", ")}
        </div>
      )}

      {groups.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {groups.map((group, index) => (
            <a
              key={group.name}
              href={`#inventory-category-${index}`}
              className="inline-flex items-center gap-2 rounded-full border border-blush bg-white px-3.5 py-2 text-xs font-medium text-ink/60 transition-colors hover:border-burgundy/30 hover:text-burgundy"
            >
              {group.name}
              <span className="rounded-full bg-blush-light px-2 py-0.5 text-[10px] text-burgundy">
                {group.parts.length}
              </span>
            </a>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-blush bg-white p-12 text-center">
          <Package size={24} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/45">No parts yet. Add your first part to create a category.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group, index) => (
            <section
              key={group.name}
              id={`inventory-category-${index}`}
              className="scroll-mt-24 overflow-hidden rounded-2xl border border-blush bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blush bg-blush-light/25 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-blush text-burgundy">
                    <FolderOpen size={17} />
                  </span>
                  <div>
                    <h2 className="font-serif text-xl text-ink">{group.name}</h2>
                    <p className="text-[11px] text-ink/45">
                      {group.parts.length} SKU{group.parts.length === 1 ? "" : "s"} · {group.units}{" "}
                      units · {money(group.valueCents)} cost value
                      {group.lowCount > 0 ? (
                        <span className="ml-2 font-semibold text-red-600">
                          {group.lowCount} low stock
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openNew(group.name)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-burgundy/25 px-3.5 py-2 text-xs font-semibold text-burgundy transition-colors hover:bg-blush"
                >
                  <Plus size={13} /> Add to {group.name}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-blush text-left text-[11px] uppercase tracking-[0.15em] text-ink/40">
                      <th className="px-5 py-3.5">Part</th>
                      <th className="px-5 py-3.5">SKU</th>
                      <th className="px-5 py-3.5">Stock</th>
                      <th className="px-5 py-3.5">Cost</th>
                      <th className="px-5 py-3.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.parts.map((part) => (
                      <tr
                        key={part.id}
                        className="border-b border-blush/50 last:border-0 hover:bg-blush-light/50"
                      >
                        <td className="px-5 py-3.5 font-medium">{part.name}</td>
                        <td className="px-5 py-3.5 text-ink/50">{part.sku}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              part.stock <= part.lowStockAt
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {part.stock}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">{money(part.costCents)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(part)}
                              aria-label={`Edit ${part.name}`}
                              className="rounded-lg p-2 text-burgundy hover:bg-blush"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                confirm(`Delete ${part.name}?`) && del.mutate({ id: part.id })
                              }
                              aria-label={`Delete ${part.name}`}
                              className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {form && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4 backdrop-blur-sm"
          onClick={() => setForm(null)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-3xl bg-ivory p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-2 font-serif text-2xl">{form.id ? "Edit part" : "Add part"}</h2>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Part name *"
              className={input}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.sku}
                onChange={(event) => setForm({ ...form, sku: event.target.value })}
                placeholder="SKU *"
                className={input}
              />
              <input
                list="part-category-options"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder="Category"
                className={input}
              />
              <datalist id="part-category-options">
                {categoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(event) => setForm({ ...form, stock: +event.target.value })}
                placeholder="Stock"
                className={input}
              />
              <input
                type="number"
                min={0}
                value={form.lowStockAt}
                onChange={(event) => setForm({ ...form, lowStockAt: +event.target.value })}
                placeholder="Low-stock alert at"
                className={input}
              />
            </div>
            <input
              type="number"
              min={0}
              value={form.costCents / 100}
              onChange={(event) =>
                setForm({ ...form, costCents: Math.round(+event.target.value * 100) })
              }
              placeholder="Unit cost ($)"
              className={input}
            />
            <p className="px-1 text-[10.5px] leading-relaxed text-ink/35">
              Category becomes the section title. Pick an existing one or type a new category such
              as “Phones”, “Screens” or “Tools”.
            </p>
            <button
              onClick={() => form.name && form.sku && upsert.mutate(form)}
              disabled={!form.name || !form.sku || upsert.isPending}
              className="w-full rounded-full bg-burgundy py-3 font-semibold text-ivory hover:bg-burgundy-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {upsert.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
