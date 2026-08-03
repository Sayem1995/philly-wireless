import "dotenv/config";
import { getDb, Timestamp } from "../server/queries/firestore.js";
import { nextId } from "../server/queries/ids.js";

/**
 * Seeds Firestore with the initial catalog for Philly Phone Repair.
 * Run with: npm run db:seed
 *
 * Requires FIRESTORE_EMULATOR_HOST (local) or production FIREBASE_* credentials.
 */
const CALL = "Call us for pricing";

async function seed() {
  const db = getDb();

  /* ---------- Repair prices ---------- */
  const prices: Array<{ category: string; brand: string; service: string; priceLabel: string; sortOrder: number }> = [];
  let so = 0;
  const add = (category: string, brand: string, service: string, priceLabel: string) =>
    prices.push({ category, brand, service, priceLabel, sortOrder: so++ });

  add("smartphone", "iPhone", "Screen Replacement", "From $79");
  add("smartphone", "Samsung Galaxy", "Screen Replacement", "From $149");
  add("smartphone", "Google Pixel", "Screen Replacement", "From $129");
  add("smartphone", "Motorola", "Screen Replacement", "From $99");
  add("smartphone", "OnePlus", "Screen Replacement", "From $129");
  add("smartphone", "iPhone", "Battery Replacement", "From $59");
  add("smartphone", "Samsung Galaxy", "Battery Replacement", "From $69");
  add("smartphone", "Google Pixel", "Battery Replacement", "From $69");
  add("smartphone", "Motorola", "Battery Replacement", "From $59");
  add("smartphone", "OnePlus", "Battery Replacement", "From $59");
  add("smartphone", "iPhone", "Charging Port Repair", "From $69");
  add("smartphone", "Samsung Galaxy", "Charging Port Repair", "From $79");
  add("smartphone", "Google Pixel", "Charging Port Repair", "From $69");
  add("smartphone", "Motorola", "Charging Port Repair", "From $69");
  add("smartphone", "OnePlus", "Charging Port Repair", "From $69");
  add("smartphone", "iPhone", "Back Glass Replacement", "From $99");
  add("smartphone", "Samsung Galaxy", "Back Glass Replacement", "From $109");
  add("smartphone", "Google Pixel", "Back Glass Replacement", CALL);
  add("smartphone", "Motorola", "Back Glass Replacement", CALL);
  add("smartphone", "OnePlus", "Back Glass Replacement", CALL);
  add("smartphone", "iPhone", "Camera Repair", "From $89");
  add("smartphone", "Samsung Galaxy", "Camera Repair", "From $99");
  add("smartphone", "Google Pixel", "Camera Repair", "From $89");
  add("smartphone", "Motorola", "Camera Repair", CALL);
  add("smartphone", "OnePlus", "Camera Repair", CALL);
  add("smartphone", "iPhone", "Speaker Repair", "From $59");
  add("smartphone", "Samsung Galaxy", "Speaker Repair", "From $69");
  add("smartphone", "Google Pixel", "Speaker Repair", "From $59");
  add("smartphone", "Motorola", "Speaker Repair", "From $59");
  add("smartphone", "OnePlus", "Speaker Repair", "From $59");
  add("smartphone", "iPhone", "Microphone Repair", "From $59");
  add("smartphone", "Samsung Galaxy", "Microphone Repair", "From $69");
  add("smartphone", "Google Pixel", "Microphone Repair", "From $59");
  add("smartphone", "Motorola", "Microphone Repair", "From $59");
  add("smartphone", "OnePlus", "Microphone Repair", "From $59");
  add("smartphone", "iPhone", "Water Damage Repair", "From $99");
  add("smartphone", "Samsung Galaxy", "Water Damage Repair", "From $109");
  add("smartphone", "Google Pixel", "Water Damage Repair", "From $99");
  add("smartphone", "Motorola", "Water Damage Repair", CALL);
  add("smartphone", "OnePlus", "Water Damage Repair", CALL);
  add("ipad", "iPad", "Screen Replacement", "From $109");
  add("ipad", "iPad", "Battery Replacement", "From $89");
  add("tablet", "Android Tablet", "Screen Replacement", "From $99");
  add("tablet", "Android Tablet", "Battery Replacement", "From $79");
  add("laptop", "Windows Laptop", "Screen Replacement", "From $149");
  add("laptop", "Windows Laptop", "Battery Replacement", "From $99");
  add("macbook", "MacBook Air", "Screen Replacement", "From $249");
  add("macbook", "MacBook Pro", "Screen Replacement", "From $299");
  add("macbook", "MacBook Air", "Battery Replacement", "From $129");
  add("macbook", "MacBook Pro", "Battery Replacement", "From $159");
  add("console", "PlayStation 5", "HDMI Port Repair", CALL);
  add("console", "Xbox Series X/S", "HDMI Port Repair", CALL);

  for (const r of prices) {
    const id = await nextId(db, "repairPrices");
    await db.collection("repairPrices").doc(String(id)).set({ id, ...r, createdAt: Timestamp.now() });
  }

  /* ---------- Products ---------- */
  const products = [
    ["iPhone 16 Pro", "device_new", "iPhone", 99900, 4, "128GB, factory unlocked, full Apple warranty.", "New"],
    ["iPhone 16", "device_new", "iPhone", 79900, 6, "128GB, factory unlocked, full Apple warranty.", "New"],
    ["iPad (10th Gen)", "device_new", "iPad", 34900, 5, "64GB Wi-Fi, sealed in box.", "New"],
    ["iPad Air M2", "device_new", "iPad", 59900, 3, "128GB Wi-Fi, sealed in box.", "New"],
    ["Samsung Galaxy Tab S9", "device_new", "Tablet", 74900, 2, "128GB Wi-Fi, sealed in box.", "New"],
    ["iPhone 14 (Refurbished)", "device_refurb", "iPhone", 47900, 5, "Grade A, new battery, 1-year store warranty.", "Grade A"],
    ["iPhone 13 (Refurbished)", "device_refurb", "iPhone", 37900, 8, "Grade A, new battery, 1-year store warranty.", "Best Seller"],
    ["iPhone 12 (Refurbished)", "device_refurb", "iPhone", 29900, 6, "Grade A-, 90%+ battery health, 1-year store warranty.", ""],
    ["iPad 9th Gen (Refurbished)", "device_refurb", "iPad", 22900, 4, "Grade A, fully tested, 1-year store warranty.", ""],
    ["iPad Air 4 (Refurbished)", "device_refurb", "iPad", 39900, 2, "Grade A, fully tested, 1-year store warranty.", ""],
    ["Galaxy Tab A8 (Refurbished)", "device_refurb", "Tablet", 14900, 3, "Grade B+, fully tested, 90-day store warranty.", ""],
    ["Phone Cases", "accessory", "Phone Cases", 1999, 60, "Slim, rugged & MagSafe-ready cases for all major models.", "From $19.99"],
    ["Phone Chargers", "accessory", "Phone Chargers", 2499, 45, "20W USB-C fast chargers, GaN options available.", "From $24.99"],
    ["Charging Cables", "accessory", "Charging Cables", 1299, 80, "Braided USB-C, Lightning & micro-USB, 1m-2m.", "From $12.99"],
    ["MagSafe Chargers", "accessory", "MagSafe Chargers", 3499, 25, "15W magnetic wireless chargers with alignment snap.", ""],
    ["Power Banks", "accessory", "Power Banks", 2999, 30, "10,000-20,000 mAh, USB-C PD fast charging.", "From $29.99"],
    ["iPad Cases", "accessory", "iPad Cases", 2499, 35, "Folio & rugged cases for iPad, Air, Pro and mini.", "From $24.99"],
    ["Laptop Chargers", "accessory", "Laptop Chargers", 3999, 20, "Universal 65W USB-C, plus Dell/HP/Lenovo tips.", "From $39.99"],
    ["MacBook Chargers", "accessory", "MacBook Chargers", 4999, 18, "61W-96W USB-C and MagSafe 3 options.", "From $49.99"],
    ["Gaming Controllers", "accessory", "Gaming Controllers", 5999, 12, "PS5 DualSense, Xbox Wireless & third-party pro pads.", "From $59.99"],
    ["Wired Headphones", "accessory", "Wired Headphones", 1499, 40, "USB-C and 3.5mm earbuds with mic.", "From $14.99"],
    ["Wireless Headphones", "accessory", "Wireless Headphones", 3999, 22, "Bluetooth earbuds & over-ear, ANC options.", "From $39.99"],
  ] as const;

  for (const [name, kind, subcategory, price, stock, description, badge] of products) {
    const id = await nextId(db, "products");
    await db.collection("products").doc(String(id)).set({
      id,
      name,
      kind,
      subcategory,
      price,
      stock,
      description,
      badge: badge || null,
      active: true,
      createdAt: Timestamp.now(),
    });
  }

  /* ---------- Parts inventory ---------- */
  const parts = [
    ["iPhone 15 Pro OLED Screen", "SCR-IP15P", "Screens", 12, 4, 14500],
    ["iPhone 14 Screen (Premium)", "SCR-IP14", "Screens", 18, 5, 6200],
    ["iPhone 13 Screen (Premium)", "SCR-IP13", "Screens", 22, 5, 4800],
    ["Galaxy S24 OLED Screen", "SCR-S24", "Screens", 6, 3, 13200],
    ["Pixel 8 OLED Screen", "SCR-PX8", "Screens", 3, 3, 9800],
    ["iPad 10 Screen Assembly", "SCR-IPAD10", "Screens", 7, 3, 5400],
    ["iPhone 15 Battery", "BAT-IP15", "Batteries", 25, 6, 1800],
    ["iPhone 13 Battery", "BAT-IP13", "Batteries", 30, 6, 1200],
    ["Galaxy S23 Battery", "BAT-S23", "Batteries", 4, 4, 1600],
    ["MacBook Air M1 Battery", "BAT-MBA-M1", "Batteries", 5, 2, 6800],
    ["USB-C Charging Port (iPhone 15)", "PRT-USBC-IP15", "Ports", 15, 5, 1400],
    ["Lightning Charging Port Flex", "PRT-LTG-FLX", "Ports", 20, 5, 900],
    ["PS5 HDMI Port", "PRT-HDMI-PS5", "Ports", 10, 3, 600],
    ["Xbox Series X HDMI Port", "PRT-HDMI-XBX", "Ports", 8, 3, 600],
    ["iPhone Rear Camera Module", "CAM-IP-REAR", "Cameras", 9, 3, 4200],
    ["MacBook Pro 14 LCD Panel", "SCR-MBP14", "Screens", 2, 2, 28900],
  ] as const;

  for (const [name, sku, category, stock, lowStockAt, costCents] of parts) {
    const id = await nextId(db, "parts");
    await db.collection("parts").doc(String(id)).set({ id, name, sku, category, stock, lowStockAt, costCents });
  }

  /* ---------- Blog posts ---------- */
  const posts = [
    {
      slug: "iphone-screen-repair-cost-philadelphia-2026",
      title: "How Much Does iPhone Screen Repair Cost in Philadelphia? (2026 Guide)",
      excerpt: "From the iPhone 11 to the iPhone 17 Pro Max — real local price ranges, aftermarket vs OEM screens, and how to avoid overpaying.",
      tag: "Pricing Guide",
      content: "Cracked screens are the most common repair we see at our Center City shop. In Philadelphia, third-party iPhone screen replacement typically runs $65-$275 depending on the model and screen grade.\n\nOlder models (iPhone 8 through 11) usually cost $65-$85. iPhone 12-14 models sit around $85-$110. The newest Pro and Pro Max models with premium OLED panels run $140-$275.\n\nThe biggest factor is screen grade. Aftermarket LCD screens are cheapest but slightly dimmer. High-quality OLED aftermarket panels are nearly indistinguishable from original. Genuine OEM pulls cost the most but match factory specs exactly.",
    },
    {
      slug: "phone-battery-replacement-signs",
      title: "5 Signs Your Phone Battery Needs Replacing",
      excerpt: "Dying before dinner? Random shutdowns at 30%? Here's how to tell a worn battery from a software problem.",
      tag: "Repair Tips",
      content: "Batteries are consumables — after 500 charge cycles, most lithium cells hold noticeably less charge. Here are the five signs we look for:\n\n1. Your phone dies before the end of a normal day.\n2. It shuts down unexpectedly at 20-40% charge.\n3. Battery health shows below 80%.\n4. The phone feels warm during light use or charging.\n5. The battery swells — a screen lifting from the frame is a safety issue.\n\nBattery replacement is one of the fastest, cheapest repairs: most phones run $59-$99 and take 30 minutes.",
    },
    {
      slug: "water-damage-first-aid-phone",
      title: "Dropped Your Phone in Water? Do This First (Not Rice)",
      excerpt: "The rice trick is a myth. What actually saves a water-damaged phone — and why the first hour matters more than anything.",
      tag: "Emergency Guide",
      content: "Every week someone walks into our shop with a phone in a bag of rice. Here's the truth: rice does almost nothing, and the time it wastes is what kills the phone.\n\nWhat actually matters is power. Water itself rarely damages a phone — short circuits do. So: turn it off immediately. Don't charge it. Don't press buttons to 'test' it.\n\nThen bring it to a repair shop as soon as possible — within hours, not days. Success rates are highest (80%+) when a phone arrives within 24 hours, powered off.",
    },
  ];

  for (const p of posts) {
    const id = await nextId(db, "blogPosts");
    await db.collection("blogPosts").doc(String(id)).set({ id, ...p, publishedAt: Timestamp.now() });
  }

  console.log("Done. Firestore seeded.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});