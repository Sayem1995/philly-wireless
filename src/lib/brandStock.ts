/**
 * Linking the repair price list to actual stock.
 *
 * The pricing table is keyed by free-text brand ("iPhone", "Samsung Galaxy")
 * while the shop catalogue is keyed by product name ("iPhone 16 Pro", "Samsung
 * Galaxy Tab S9"). There is no shared identifier, so the link is a name match —
 * which means the matching rule has to be explicit and tested rather than
 * guessed at in the UI.
 *
 * This is deliberately a *view* helper: it never writes anything, it just
 * answers "which products would I show if this row were expanded".
 */

export type Matchable = { name: string };

/**
 * Normalise for comparison: lowercase, and collapse non-alphanumerics to single
 * spaces. Keeps "iPhone 17" and "iphone  17" equal.
 */
function normalize(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * All search terms must appear somewhere in the product name, whole-word.
 *
 * Whole-word matching matters: a substring test would match "samsung" inside
 * "samsunghifi", and pairing unrelated products to a price row is worse than
 * showing none.
 */
function containsAllTerms(haystack: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  return terms.every((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
  });
}

/**
 * Products whose name matches a brand, best matches first.
 *
 * Ranked so the most likely intent wins:
 *   1. the name *is* the brand            — "iPhone" → "iPhone"
 *   2. the name starts with the brand     — "iPhone" → "iPhone 16 Pro"
 *   3. every brand word appears           — "Samsung Galaxy" → "Samsung Galaxy Tab S9"
 *   4. only the *last* brand word appears — "Samsung Galaxy" → "Galaxy Tab A8"
 *
 * Rank 4 exists because the price list and the catalogue disagree about
 * prefixes in practice: the price list says "Samsung Galaxy" while the seeded
 * product is "Galaxy Tab A8". Requiring every word would hide that product
 * entirely, which defeats the point of the drill-down.
 *
 * It deliberately matches on the *last* word rather than any word: brand names
 * run generic → specific ("Google Pixel", "Samsung Galaxy"), so the final word
 * is the distinctive one. Matching on any word would pair "Google Pixel" with
 * every product containing "Google".
 *
 * Ties keep catalogue order, so the list is stable between renders.
 */
export function matchingProducts<T extends Matchable>(brand: string, products: T[]): T[] {
  const brandNorm = normalize(brand);
  if (!brandNorm) return [];
  const terms = brandNorm.split(" ");
  const lastTerm = terms[terms.length - 1];

  const ranked: Array<{ product: T; rank: number; index: number }> = [];

  products.forEach((product, index) => {
    const nameNorm = normalize(product.name);
    if (!nameNorm) return;

    if (nameNorm === brandNorm) {
      ranked.push({ product, rank: 0, index });
      return;
    }
    if (nameNorm.startsWith(`${brandNorm} `)) {
      ranked.push({ product, rank: 1, index });
      return;
    }
    if (containsAllTerms(nameNorm, terms)) {
      ranked.push({ product, rank: 2, index });
      return;
    }
    // Relaxed fallback, only worth trying for a multi-word brand.
    if (terms.length > 1 && containsAllTerms(nameNorm, [lastTerm])) {
      ranked.push({ product, rank: 3, index });
    }
  });

  ranked.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));
  return ranked.map((entry) => entry.product);
}

export type StockSummary = {
  matched: number;
  inStock: number;
  totalUnits: number;
  soldOut: number;
};

/** Roll up stock across matched products, for the collapsed row badge. */
export function summarizeStock(products: Array<{ stock: number }>): StockSummary {
  const totalUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const inStock = products.filter((p) => (Number(p.stock) || 0) > 0).length;
  return {
    matched: products.length,
    inStock,
    totalUnits,
    soldOut: products.length - inStock,
  };
}
