import { ArrowUpDown, ChevronDown, Search, X } from "lucide-react";
import type { ProductSort } from "@/lib/productCatalog";

type ProductToolbarProps = {
  query: string;
  onQuery: (value: string) => void;
  sort: ProductSort;
  onSort: (value: ProductSort) => void;
  resultCount: number;
  label: string;
  placeholder: string;
};

/** Search/sort controls shared by the devices and accessories catalogues. */
export default function ProductToolbar({
  query,
  onQuery,
  sort,
  onSort,
  resultCount,
  label,
  placeholder,
}: ProductToolbarProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full sm:max-w-sm">
        <span className="sr-only">Search {label}</span>
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-full border border-ink/15 bg-white py-3 pl-10 pr-10 text-sm text-ink placeholder:text-ink/35 focus:border-burgundy focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-ink/40 hover:bg-blush hover:text-burgundy"
          >
            <X size={14} />
          </button>
        )}
      </label>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-[12px] text-ink/45 tabular-nums" aria-live="polite">
          {resultCount} {resultCount === 1 ? "item" : "items"}
        </span>
        <label className="relative inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-3.5 py-2.5">
          <ArrowUpDown size={14} className="text-ink/40" />
          <span className="sr-only">Sort {label}</span>
          <select
            value={sort}
            onChange={(event) => onSort(event.target.value as ProductSort)}
            className="appearance-none bg-transparent pr-4 text-[12.5px] font-medium text-ink/65 focus:outline-none"
          >
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name A–Z</option>
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/35"
          />
        </label>
      </div>
    </div>
  );
}
