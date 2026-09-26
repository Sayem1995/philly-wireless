/**
 * Bulk price import parsing.
 *
 * Runs entirely before anything is written, so a malformed paste is rejected
 * with a line number instead of half-applying to the live price list.
 *
 * Pure and dependency-free so it can be tested directly, and so the admin UI
 * can preview the exact rows a paste would create.
 */

export type ParsedPriceRow = {
  category: string;
  brand: string;
  service: string;
  priceLabel: string;
  line: number;
};

export type ParseIssue = { line: number; message: string };

export type ParseResult = {
  rows: ParsedPriceRow[];
  issues: ParseIssue[];
};

const COLUMNS = ["category", "brand", "service", "price"] as const;

/** Strip a UTF-8 BOM, which Excel prepends and which breaks the first header. */
function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/**
 * Split one CSV line, honouring double-quoted fields and `""` escapes.
 *
 * Hand-rolled rather than split(",") because price labels can legitimately
 * contain commas ("From $129, parts included") and a naive split would shear
 * the row in half.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(field);
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Work out the column separator.
 *
 * Pipes and tabs are unambiguous and win outright. Commas are only used when
 * the line has no pipe or tab AND the first line looks like a header, because
 * a comma inside a price label would otherwise silently look like a separator.
 */
function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  if (sample.includes("|")) return "|";
  if (sample.includes("\t")) return "\t";
  return ",";
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "|") return line.split("|").map((f) => f.trim());
  if (delimiter === "\t") return line.split("\t").map((f) => f.trim());
  return splitCsvLine(line).map((f) => f.trim());
}

/** True when a row is a header rather than data. */
function looksLikeHeader(fields: string[]): boolean {
  const normalised = fields.map((f) => f.toLowerCase().replace(/[^a-z]/g, ""));
  return COLUMNS.some((column) => normalised.includes(column));
}

/**
 * Parse pasted or uploaded price rows.
 *
 * Accepts `category | brand | service | price` per line, with an optional
 * header row, and tolerates pipe / tab / CSV separators. Blank lines and
 * `#` comments are ignored so a paste can be annotated.
 */
export function parsePriceRows(input: string): ParseResult {
  const rows: ParsedPriceRow[] = [];
  const issues: ParseIssue[] = [];

  const allLines = stripBom(String(input ?? "")).split(/\r?\n/);
  // Keep original line numbers while dropping lines we ignore entirely.
  const meaningful = allLines
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => text.trim() !== "" && !text.trim().startsWith("#"));

  if (meaningful.length === 0) return { rows, issues };

  const delimiter = detectDelimiter(meaningful.map((l) => l.text));

  meaningful.forEach(({ text, line }, index) => {
    const fields = splitLine(text, delimiter);

    if (index === 0 && looksLikeHeader(fields)) return;

    if (fields.length < COLUMNS.length) {
      issues.push({
        line,
        message: `Expected 4 columns (category | brand | service | price) but found ${fields.length}.`,
      });
      return;
    }
    if (fields.length > COLUMNS.length) {
      issues.push({
        line,
        message: `Found ${fields.length} columns — is a price containing the “${delimiter}” separator? Quote it or use a different separator.`,
      });
      return;
    }

    const [category, brand, service, priceLabel] = fields;
    const missing = COLUMNS.filter((_, i) => !fields[i]);
    if (missing.length > 0) {
      issues.push({ line, message: `Empty ${missing.join(", ")} value.` });
      return;
    }

    rows.push({
      // Matches createPrice, so an imported row is indistinguishable from a typed one.
      category: category.toLowerCase(),
      brand,
      service,
      priceLabel,
      line,
    });
  });

  return { rows, issues };
}

/** Identity of a price row — used to skip rows that already exist. */
export function priceKey(row: {
  category: string;
  brand: string;
  service: string;
}): string {
  return `${row.category.trim().toLowerCase()}|${row.brand.trim().toLowerCase()}|${row.service.trim().toLowerCase()}`;
}

/**
 * Split parsed rows into ones that would be added and ones already present.
 *
 * Makes re-running an import safe: pasting the same block twice adds nothing
 * the second time rather than duplicating the whole price list.
 */
export function partitionNewRows<T extends { category: string; brand: string; service: string }>(
  rows: T[],
  existing: Array<{ category: string; brand: string; service: string }>,
): { fresh: T[]; duplicates: T[] } {
  const seen = new Set(existing.map(priceKey));
  const fresh: T[] = [];
  const duplicates: T[] = [];

  for (const row of rows) {
    const key = priceKey(row);
    if (seen.has(key)) {
      duplicates.push(row);
      continue;
    }
    // Also guards against the same row appearing twice within one paste.
    seen.add(key);
    fresh.push(row);
  }

  return { fresh, duplicates };
}
