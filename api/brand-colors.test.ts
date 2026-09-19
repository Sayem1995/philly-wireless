import { describe, expect, it } from "vitest";
import { readBrandColors } from "../contracts/brand.js";
import JSON_PALETTE_RAW from "../contracts/brand-colors.json";

/**
 * The default palette exists in two places, and this test is the reason that is
 * safe:
 *
 *   • `contracts/brand-colors.json` — the source of truth, read by
 *     `tailwind.config.js` and `vite.config.ts` (both plain Node).
 *   • `DEFAULT_COLORS` inside `contracts/brand.ts` — a TypeScript mirror,
 *     because that module is also bundled for the browser, where neither
 *     `createRequire` nor a `.cjs` import works.
 *
 * If those two copies disagree, emails would be themed from one palette and the
 * website from another. This asserts they are identical.
 */

interface JsonPalette {
  _comment?: unknown;
  primary: { DEFAULT: string; dark: string; light: string };
  secondary: { DEFAULT: string; dark: string; light: string };
  surface: string;
  ink: string;
  accent: string;
}

const JSON_PALETTE = JSON_PALETTE_RAW as JsonPalette;

const stripComment = (p: JsonPalette) => {
  const { _comment, ...rest } = p;
  void _comment;
  return rest;
};

describe("brand palette", () => {
  it("keeps brand-colors.json and the inlined TypeScript defaults identical", () => {
    expect(stripComment(JSON_PALETTE)).toEqual(readBrandColors());
  });

  it("exposes the JSON palette without a leading underscore key leaking in", () => {
    // `_comment` documents the file for humans; it must not be treated as a colour.
    expect(Object.keys(stripComment(JSON_PALETTE)).sort()).toEqual([
      "accent",
      "ink",
      "primary",
      "secondary",
      "surface",
    ]);
  });

  it("defines every colour as a valid 6-digit hex", () => {
    const palette = readBrandColors();
    const values = [
      palette.primary.DEFAULT,
      palette.primary.dark,
      palette.primary.light,
      palette.secondary.DEFAULT,
      palette.secondary.dark,
      palette.secondary.light,
      palette.surface,
      palette.ink,
      palette.accent,
    ];
    for (const value of values) {
      expect(value, `"${value}" should be a #RRGGBB colour`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
