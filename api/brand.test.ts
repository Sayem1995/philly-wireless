import { afterEach, describe, expect, it } from "vitest";
import {
  readBrand,
  readBrandColors,
  brandCssVariables,
  hexToRgbTriplet,
  parseHours,
  schemaOpeningHours,
  compactHours,
  longHours,
  toTelHref,
  toWhatsAppNumber,
  mapsEmbed,
} from "../contracts/brand.js";

/**
 * These tests pin the behaviour that lets one repo serve several storefronts:
 * correct parsing of the `BRAND_*` overrides, and — just as importantly —
 * Philly Phone Repair's exact values surviving as the defaults, so an
 * unconfigured deployment cannot silently change what customers see.
 */

const BRAND_VARS = [
  "BRAND_NAME",
  "BRAND_STREET",
  "BRAND_CITY",
  "BRAND_PHONE",
  "BRAND_EMAIL",
  "BRAND_HOURS",
  "BRAND_PRIMARY",
  "BRAND_SECONDARY",
  "BRAND_SURFACE",
  "BRAND_INK",
  "BRAND_ACCENT",
  "BRAND_REGION",
  "BRAND_CITY_LABEL",
] as const;

afterEach(() => {
  for (const name of BRAND_VARS) delete process.env[name];
});

describe("Philly Phone Repair defaults", () => {
  it("resolves the live store's real values when nothing is configured", () => {
    const b = readBrand();
    expect(b.name).toBe("Philly Phone Repair");
    expect(b.wordmarkPrimary).toBe("Philly");
    expect(b.wordmarkAccent).toBe("Phone Repair");
    expect(b.address).toBe("1033 Chestnut Street");
    expect(b.city).toBe("Philadelphia, PA 19107");
    expect(b.phone).toBe("(215) 555-0123");
    expect(b.email).toBe("hello@phillyphonerepair.com");
    expect(b.logo.type).toBe("image");
    expect(b.logo.icon).toBe("/logo-icon.png");
  });

  it("keeps the exact telephone and WhatsApp links the site shipped with", () => {
    // Regression guard: these were hardcoded before branding was configurable,
    // and a dropped "+1" would silently break click-to-call on mobile.
    const b = readBrand();
    expect(b.phoneHref).toBe("tel:+12155550123");
    expect(b.whatsapp).toBe("12155550123");
  });

  it("keeps the original opening hours and schema.org output", () => {
    expect(schemaOpeningHours(readBrand().hours)).toEqual([
      "Mo-Fr 09:00-19:00",
      "Sa 10:00-18:00",
      "Su 12:00-17:00",
    ]);
    expect(compactHours(readBrand().hours)).toBe("Mon–Fri 9–7 · Sat 10–6 · Sun 12–5");
    expect(longHours(readBrand().hours)).toBe("Mon–Fri 9AM–7PM · Sat 10AM–6PM · Sun 12PM–5PM");
  });

  it("keeps the original palette", () => {
    const colors = readBrandColors();
    expect(colors.primary.DEFAULT).toBe("#7F1D1D");
    expect(colors.secondary.DEFAULT).toBe("#F3D5D8");
    expect(colors.surface).toBe("#FFFDF7");
    expect(colors.ink).toBe("#2B1A18");
  });

  it("splits the address into schema.org fields", () => {
    expect(readBrand().addressParts).toEqual({
      street: "1033 Chestnut Street",
      locality: "Philadelphia",
      region: "PA",
      postalCode: "19107",
    });
  });
});

describe("BRAND_* overrides (a second store)", () => {
  it("applies every override and splits the wordmark from the new name", () => {
    process.env.BRAND_NAME = "Prime Wireless";
    process.env.BRAND_STREET = "25 South 19th Street";
    process.env.BRAND_CITY = "Philadelphia, PA 19103";
    process.env.BRAND_PHONE = "(215) 555-0100";
    process.env.BRAND_EMAIL = "hello@primewireless.example";
    process.env.BRAND_HOURS = "Monday-Saturday|10 AM-10 PM;Sunday|11 AM-9 PM";
    process.env.BRAND_PRIMARY = "#0B2545";
    process.env.BRAND_ACCENT = "#1E90FF";

    const b = readBrand();
    expect(b.name).toBe("Prime Wireless");
    expect(b.wordmarkPrimary).toBe("Prime");
    expect(b.wordmarkAccent).toBe("Wireless");
    expect(b.addressParts).toEqual({
      street: "25 South 19th Street",
      locality: "Philadelphia",
      region: "PA",
      postalCode: "19103",
    });
    expect(b.phoneHref).toBe("tel:+12155550100");
    expect(b.whatsapp).toBe("12155550100");
    expect(b.colors.primary.DEFAULT).toBe("#0B2545");
    expect(b.colors.accent).toBe("#1E90FF");
    // Untouched values still fall back to the built-in defaults.
    expect(b.colors.secondary.DEFAULT).toBe("#F3D5D8");
  });

  it("renders the second store's opening hours into schema.org", () => {
    process.env.BRAND_HOURS = "Monday-Saturday|10 AM-10 PM;Sunday|11 AM-9 PM";
    const b = readBrand();
    expect(schemaOpeningHours(b.hours)).toEqual(["Mo-Sa 10:00-22:00", "Su 11:00-21:00"]);
    expect(compactHours(b.hours)).toBe("Mon–Sat 10–10 · Sun 11–9");
  });
});

describe("phone number normalisation", () => {
  it("adds +1 to bare North-American numbers", () => {
    expect(toTelHref("(215) 555-0123")).toBe("tel:+12155550123");
    expect(toTelHref("2155550123")).toBe("tel:+12155550123");
    expect(toTelHref("12155550123")).toBe("tel:+12155550123");
    expect(toWhatsAppNumber("(215) 555-0123")).toBe("12155550123");
  });

  it("leaves an already-international number alone", () => {
    expect(toTelHref("+442071234567")).toBe("tel:+442071234567");
    expect(toWhatsAppNumber("+442071234567")).toBe("442071234567");
  });
});

describe("parseHours", () => {
  it("expands a day range into the days it covers", () => {
    const rows = parseHours("Monday-Saturday|10 AM-10 PM");
    expect(rows).toHaveLength(1);
    expect(rows[0].days).toEqual([
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    ]);
  });

  it("handles abbreviated and comma-separated day lists", () => {
    expect(parseHours("Mon-Fri|9 AM-5 PM")[0].days).toHaveLength(5);
    const split = parseHours("Sat,Sun|12 PM-4 PM");
    expect(split).toHaveLength(2);
    expect(split[0].days).toEqual(["saturday"]);
    expect(split[1].days).toEqual(["sunday"]);
  });

  it("converts 12-hour times, including noon and midnight", () => {
    expect(schemaOpeningHours(parseHours("Monday|12 PM-5 PM"))).toEqual(["Mo 12:00-17:00"]);
    expect(schemaOpeningHours(parseHours("Monday|12 AM-11 AM"))).toEqual(["Mo 00:00-11:00"]);
  });

  it("rejects a malformed row loudly instead of silently showing wrong hours", () => {
    expect(() => parseHours("Monday to Saturday 10-10")).toThrow(/BRAND_HOURS/);
  });
});

describe("hexToRgbTriplet", () => {
  it("converts the palette into CSS custom-property channels", () => {
    expect(hexToRgbTriplet("#7F1D1D")).toBe("127 29 29");
    expect(hexToRgbTriplet("7F1D1D")).toBe("127 29 29");
    expect(hexToRgbTriplet("#FFF")).toBe("255 255 255");
    expect(brandCssVariables(readBrandColors())["--brand-primary"]).toBe("127 29 29");
  });

  it("throws on a value that is not a colour", () => {
    expect(() => hexToRgbTriplet("navy")).toThrow(/Invalid hex/);
  });
});

describe("mapsEmbed", () => {
  it("builds a query containing the configured street and ZIP", () => {
    const url = mapsEmbed(readBrand().addressParts);
    expect(url).toContain("maps.google.com/maps?q=");
    expect(decodeURIComponent(url)).toContain("1033 Chestnut Street");
    expect(decodeURIComponent(url)).toContain("19107");
  });
});
