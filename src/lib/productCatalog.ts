export type ProductSort = "featured" | "price-asc" | "price-desc" | "name";

type SearchableProduct = {
  name: string;
  description?: string | null;
  subcategory?: string | null;
};

/** Case-insensitive search across the fields customers can see on a card. */
export function filterProducts<T extends SearchableProduct>(
  products: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...products];
  return products.filter((product) =>
    [product.name, product.description, product.subcategory]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
}

/**
 * Stable catalogue ordering. `featured` preserves the server/admin order, which
 * is intentional: the shop controls what appears first.
 */
export function sortProducts<T extends { name: string; price: number }>(
  products: readonly T[],
  sort: ProductSort,
): T[] {
  const rows = [...products];
  switch (sort) {
    case "price-asc":
      return rows.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    case "price-desc":
      return rows.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
    case "name":
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return rows;
  }
}
