import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ImagePlus, Loader2, X } from "lucide-react";
import {
  ACCEPTED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  formatBytes,
  productImageUrl,
  validateProductImageFile,
} from "@/lib/productImages";
import {
  ProductImageUploadError,
  uploadProductImage,
} from "@/lib/productImageUpload";

type PForm = {
  id?: number;
  name: string;
  kind: "device_new" | "device_refurb" | "accessory";
  subcategory: string;
  price: number;
  stock: number;
  description: string;
  badge: string;
  /** Id of a `productImages` document; the URL is derived from it. */
  imagePath: string | null;
  active: boolean;
};
const empty: PForm = { name: "", kind: "accessory", subcategory: "", price: 0, stock: 0, description: "", badge: "", imagePath: null, active: true };

export default function Products() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.products.useQuery();
  const [form, setForm] = useState<PForm | null>(null);
  const upsert = trpc.admin.upsertProduct.useMutation({ onSuccess: () => { utils.admin.products.invalidate(); setForm(null); toast.success("Product saved"); } });
  const del = trpc.admin.deleteProduct.useMutation({ onSuccess: () => { utils.admin.products.invalidate(); toast.success("Product deleted"); } });
  const input = "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy w-full";

  // Upload state lives outside the modal markup so it survives re-renders and
  // so the picker can be reset every time the dialog opens.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Set when the saved image cannot actually be fetched back from Storage, so
  // a broken image is reported instead of silently rendering as a blank box.
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Derived so the reset effect below has dependencies ESLint can verify.
  const isFormOpen = Boolean(form);
  const editingId = form?.id ?? null;

  // Clear any stale "uploading"/error state between opens.
  useEffect(() => {
    setUploading(false);
    setUploadError(null);
    setPreviewFailed(false);
    if (fileInput.current) fileInput.current.value = "";
  }, [isFormOpen, editingId]);

  const handlePickFile = async (file: File) => {
    if (!form) return;
    const check = validateProductImageFile(file);
    if (!check.ok) {
      setUploadError(check.reason);
      return;
    }
    setUploadError(null);
    setPreviewFailed(false);
    setUploading(true);
    try {
      const { id, bytes } = await uploadProductImage(form.name.trim() || "product", file);
      setForm((current) => (current ? { ...current, imagePath: id } : current));
      toast.success(`Image uploaded (${formatBytes(bytes)}) — remember to save the product`);
    } catch (err) {
      setUploadError(
        err instanceof ProductImageUploadError
          ? err.message
          : "The image upload failed. Check your connection and try again.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const previewUrl = productImageUrl(form);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif text-3xl text-ink">Products</h1>
        <button onClick={() => setForm(empty)} className="bg-burgundy text-ivory text-sm font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 hover:bg-burgundy-dark"><Plus size={15} /> Add Product</button>
      </div>
      <div className="bg-white rounded-2xl border border-blush overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead><tr className="text-left text-[11px] tracking-[0.15em] uppercase text-ink/40 border-b border-blush">
            <th className="px-5 py-4">Image</th><th className="px-5 py-4">Product</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Price</th><th className="px-5 py-4">Stock</th><th className="px-5 py-4">Status</th><th className="px-5 py-4"></th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-blush/50 hover:bg-blush-light/50">
                <td className="px-5 py-3.5">
                  {productImageUrl(p) ? (
                    <img src={productImageUrl(p)!} alt={p.name} loading="lazy" className="w-12 h-12 rounded-lg object-cover border border-blush bg-blush-light" />
                  ) : (
                    <span className="w-12 h-12 rounded-lg border border-dashed border-ink/15 grid place-items-center text-ink/25" title="No image"><ImagePlus size={16} /></span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-medium">{p.name}</td>
                <td className="px-5 py-3.5 text-xs">{p.kind === "device_new" ? "New device" : p.kind === "device_refurb" ? "Refurbished" : "Accessory"}</td>
                <td className="px-5 py-3.5">{p.subcategory}</td>
                <td className="px-5 py-3.5 font-semibold text-burgundy">${(p.price / 100).toFixed(2)}</td>
                <td className="px-5 py-3.5">{p.stock}</td>
                <td className="px-5 py-3.5"><span className={`text-[11px] px-3 py-1 rounded-full ${p.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>{p.active ? "Live" : "Hidden"}</span></td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-2">
                    <button onClick={() => setForm({ id: p.id, name: p.name, kind: p.kind, subcategory: p.subcategory, price: p.price, stock: p.stock, description: p.description ?? "", badge: p.badge ?? "", imagePath: p.imagePath ?? null, active: p.active })} className="text-burgundy hover:bg-blush p-2 rounded-lg"><Pencil size={14} /></button>
                    <button onClick={() => confirm("Delete this product?") && del.mutate({ id: p.id })} className="text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center px-4 overflow-y-auto py-8" onClick={() => setForm(null)}>
          <div className="bg-ivory rounded-3xl p-8 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-2xl mb-2">{form.id ? "Edit product" : "Add product"}</h2>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name *" className={input} />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PForm["kind"] })} className={input}>
                <option value="device_new">New device</option><option value="device_refurb">Refurbished</option><option value="accessory">Accessory</option>
              </select>
              <input value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} placeholder="Category *" className={input} />
              <input type="number" min={0} step="0.01" value={form.price / 100} onChange={(e) => setForm({ ...form, price: Math.round(+e.target.value * 100) })} placeholder="Price ($)" className={input} />
              <input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: +e.target.value })} placeholder="Stock" className={input} />
            </div>
            <input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="Badge (e.g. Best Seller)" className={input} />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={3} className={`${input} resize-none`} />

            {/* Image — uploaded straight to Firebase Storage; the object path is saved on the row. */}
            <div className="rounded-2xl border border-ink/15 bg-white/60 p-3.5 space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="w-24 h-24 shrink-0 rounded-xl border border-blush bg-blush-light grid place-items-center overflow-hidden">
                  {previewUrl && !previewFailed ? (
                    <img
                      src={previewUrl}
                      alt="Product preview"
                      className="w-full h-full object-cover"
                      onLoad={() => setPreviewFailed(false)}
                      onError={() => setPreviewFailed(true)}
                    />
                  ) : (
                    <ImagePlus size={22} className="text-ink/25" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-[13px] font-semibold text-ink">Product image</p>
                  <p className="text-[11.5px] text-ink/50 leading-relaxed">JPEG, PNG, WebP, AVIF, GIF or SVG · up to {Math.round(MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024)} MB. Large photos are resized automatically.</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ACCEPTED_PRODUCT_IMAGE_TYPES.join(",")}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handlePickFile(file);
                      }}
                    />
                    <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 border border-burgundy/25 text-burgundy text-[12.5px] font-semibold px-4 py-2 rounded-full hover:bg-burgundy hover:text-ivory transition-colors disabled:opacity-50">
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                      {uploading ? "Uploading…" : form.imagePath ? "Replace image" : "Choose image"}
                    </button>
                    {form.imagePath && !uploading && (
                      <button type="button" onClick={() => setForm({ ...form, imagePath: null })} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink/50 hover:text-red-600 px-2 py-2"><X size={13} /> Remove</button>
                    )}
                  </div>
                </div>
              </div>
              {uploadError && <p className="text-[12px] text-red-600 leading-relaxed">{uploadError}</p>}
              {previewFailed && form.imagePath && (
                <p className="text-[12px] text-red-600 leading-relaxed">
                  Saved, but the image could not be loaded back — the stored image may have been deleted. Try uploading it again.
                </p>
              )}
              {form.imagePath && !uploadError && <p className="text-[11px] text-ink/40 break-all">Stored as <span className="font-mono">{form.imagePath}</span></p>}
            </div>

            <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-burgundy w-4 h-4" /> Visible on website</label>
            {uploading && <p className="text-[12px] text-burgundy text-center">Waiting for the image upload to finish…</p>}
            <button
              disabled={upsert.isPending || uploading}
              onClick={() => form.name && form.subcategory && upsert.mutate(form)}
              className="w-full bg-burgundy text-ivory font-semibold py-3 rounded-full hover:bg-burgundy-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {upsert.isPending ? "Saving…" : uploading ? "Uploading image…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
