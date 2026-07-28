export const Session = {
  cookieName: "kimi_sid",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

/* ================= BUSINESS CONSTANTS ================= */
export const STORE = {
  name: "Philly Phone Repair",
  address: "1033 Chestnut Street",
  city: "Philadelphia, PA 19107",
  phone: "(215) 555-0123",
  phoneHref: "tel:+12155550123",
  email: "hello@phillyphonerepair.com",
  hours: [
    { d: "Monday – Friday", h: "9:00 AM – 7:00 PM" },
    { d: "Saturday", h: "10:00 AM – 6:00 PM" },
    { d: "Sunday", h: "12:00 PM – 5:00 PM" },
  ],
} as const;

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
