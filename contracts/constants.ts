import { readBrand } from "./brand.js";

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

/* ================= BUSINESS CONSTANTS ================= */

/**
 * Store identity now lives in `contracts/brand.ts` and is resolved from the
 * environment, so one repo can serve several storefronts. `BRAND` is the
 * canonical export; `STORE` is kept as an alias because it is referenced
 * throughout the server (emails, SMS, receipts) and renaming every call site
 * would create churn for no benefit.
 */
export const BRAND = readBrand();

export const STORE = {
  name: BRAND.name,
  address: BRAND.address,
  city: BRAND.city,
  phone: BRAND.phone,
  phoneHref: BRAND.phoneHref,
  email: BRAND.email,
  hours: BRAND.hours.map(({ d, h }) => ({ d, h })),
} as const;

export const STORE_HOURS = BRAND.hours;
export const BRAND_COLORS = BRAND.colors;
export const BRAND_TAGLINE = BRAND.tagline;
export const BRAND_DESCRIPTION = BRAND.description;
export const BRAND_LOGO = BRAND.logo;
export const BRAND_SITE_URL = BRAND.siteUrl;

export const BOOKING_DEVICES = [
  "iPhone",
  "Samsung Galaxy",
  "Google Pixel",
  "Motorola",
  "OnePlus",
  "iPad",
  "Tablet (Android)",
  "MacBook",
  "Laptop (Windows)",
  "PlayStation 5",
  "Xbox Series X/S",
  "Other",
] as const;

export const BOOKING_REPAIRS = [
  "Screen Replacement",
  "Battery Replacement",
  "Charging Port Repair",
  "Back Glass Replacement",
  "Camera Repair",
  "Speaker Repair",
  "Microphone Repair",
  "Water Damage Repair",
  "HDMI Port Repair",
  "Not sure — free diagnostic",
] as const;

export const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
] as const;

export const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "completed",
  "rescheduled",
  "cancelled",
] as const;

export const WARRANTY_DAYS = { screen: 365, battery: 90, other: 90 } as const;
