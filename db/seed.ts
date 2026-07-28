import { getDb } from "../api/queries/connection";
import {
  repairPrices,
  products,
  parts,
  blogPosts,
} from "./schema";

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  /* ---------- REPAIR PRICES (based on Philadelphia market research) ---------- */
  const CALL = "Call us for pricing";
  const priceRows: (typeof repairPrices.$inferInsert)[] = [];
  let so = 0;
  const add = (
    category: string,
    brand: string,
    service: string,
    priceLabel: string,
  ) => priceRows.push({ category, brand, service, priceLabel, sortOrder: so++ });

  // Smartphones
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

  // iPad / Tablet
  add("ipad", "iPad", "Screen Replacement", "From $109");
  add("ipad", "iPad", "Battery Replacement", "From $89");
  add("tablet", "Android Tablet", "Screen Replacement", "From $99");
  add("tablet", "Android Tablet", "Battery Replacement", "From $79");

  // Laptop / MacBook
  add("laptop", "Windows Laptop", "Screen Replacement", "From $149");
  add("laptop", "Windows Laptop", "Battery Replacement", "From $99");
  add("macbook", "MacBook Air", "Screen Replacement", "From $249");
  add("macbook", "MacBook Pro", "Screen Replacement", "From $299");
  add("macbook", "MacBook Air", "Battery Replacement", "From $129");
  add("macbook", "MacBook Pro", "Battery Replacement", "From $159");

  // Consoles
  add("console", "PlayStation 5", "HDMI Port Repair", CALL);
  add("console", "Xbox Series X/S", "HDMI Port Repair", CALL);

  await db.insert(repairPrices).values(priceRows);

  /* ---------- PRODUCTS ---------- */
  await db.insert(products).values([
    // Brand new devices
    { name: "iPhone 16 Pro", kind: "device_new", subcategory: "iPhone", price: 99900, stock: 4, description: "128GB, factory unlocked, full Apple warranty.", badge: "New" },
    { name: "iPhone 16", kind: "device_new", subcategory: "iPhone", price: 79900, stock: 6, description: "128GB, factory unlocked, full Apple warranty.", badge: "New" },
    { name: "iPad (10th Gen)", kind: "device_new", subcategory: "iPad", price: 34900, stock: 5, description: "64GB Wi-Fi, sealed in box.", badge: "New" },
    { name: "iPad Air M2", kind: "device_new", subcategory: "iPad", price: 59900, stock: 3, description: "128GB Wi-Fi, sealed in box.", badge: "New" },
    { name: "Samsung Galaxy Tab S9", kind: "device_new", subcategory: "Tablet", price: 74900, stock: 2, description: "128GB Wi-Fi, sealed in box.", badge: "New" },
    // Refurbished devices
    { name: "iPhone 14 (Refurbished)", kind: "device_refurb", subcategory: "iPhone", price: 47900, stock: 5, description: "Grade A, new battery, 1-year store warranty.", badge: "Grade A" },
    { name: "iPhone 13 (Refurbished)", kind: "device_refurb", subcategory: "iPhone", price: 37900, stock: 8, description: "Grade A, new battery, 1-year store warranty.", badge: "Best Seller" },
    { name: "iPhone 12 (Refurbished)", kind: "device_refurb", subcategory: "iPhone", price: 29900, stock: 6, description: "Grade A-, 90%+ battery health, 1-year store warranty." },
    { name: "iPad 9th Gen (Refurbished)", kind: "device_refurb", subcategory: "iPad", price: 22900, stock: 4, description: "Grade A, fully tested, 1-year store warranty." },
    { name: "iPad Air 4 (Refurbished)", kind: "device_refurb", subcategory: "iPad", price: 39900, stock: 2, description: "Grade A, fully tested, 1-year store warranty." },
    { name: "Galaxy Tab A8 (Refurbished)", kind: "device_refurb", subcategory: "Tablet", price: 14900, stock: 3, description: "Grade B+, fully tested, 90-day store warranty." },
    // Accessories
    { name: "Phone Cases", kind: "accessory", subcategory: "Phone Cases", price: 1999, stock: 60, description: "Slim, rugged & MagSafe-ready cases for all major models.", badge: "From $19.99" },
    { name: "Phone Chargers", kind: "accessory", subcategory: "Phone Chargers", price: 2499, stock: 45, description: "20W USB-C fast chargers, GaN options available.", badge: "From $24.99" },
    { name: "Charging Cables", kind: "accessory", subcategory: "Charging Cables", price: 1299, stock: 80, description: "Braided USB-C, Lightning & micro-USB, 1m–2m.", badge: "From $12.99" },
    { name: "MagSafe Chargers", kind: "accessory", subcategory: "MagSafe Chargers", price: 3499, stock: 25, description: "15W magnetic wireless chargers with alignment snap." },
    { name: "Power Banks", kind: "accessory", subcategory: "Power Banks", price: 2999, stock: 30, description: "10,000–20,000 mAh, USB-C PD fast charging.", badge: "From $29.99" },
    { name: "iPad Cases", kind: "accessory", subcategory: "iPad Cases", price: 2499, stock: 35, description: "Folio & rugged cases for iPad, Air, Pro and mini.", badge: "From $24.99" },
    { name: "Laptop Chargers", kind: "accessory", subcategory: "Laptop Chargers", price: 3999, stock: 20, description: "Universal 65W USB-C, plus Dell/HP/Lenovo tips.", badge: "From $39.99" },
    { name: "MacBook Chargers", kind: "accessory", subcategory: "MacBook Chargers", price: 4999, stock: 18, description: "61W–96W USB-C and MagSafe 3 options.", badge: "From $49.99" },
    { name: "Gaming Controllers", kind: "accessory", subcategory: "Gaming Controllers", price: 5999, stock: 12, description: "PS5 DualSense, Xbox Wireless & third-party pro pads.", badge: "From $59.99" },
    { name: "Wired Headphones", kind: "accessory", subcategory: "Wired Headphones", price: 1499, stock: 40, description: "USB-C and 3.5mm earbuds with mic.", badge: "From $14.99" },
    { name: "Wireless Headphones", kind: "accessory", subcategory: "Wireless Headphones", price: 3999, stock: 22, description: "Bluetooth earbuds & over-ear, ANC options.", badge: "From $39.99" },
  ]);

  /* ---------- PARTS INVENTORY ---------- */
  await db.insert(parts).values([
    { name: "iPhone 15 Pro OLED Screen", sku: "SCR-IP15P", category: "Screens", stock: 12, lowStockAt: 4, costCents: 14500 },
    { name: "iPhone 14 Screen (Premium)", sku: "SCR-IP14", category: "Screens", stock: 18, lowStockAt: 5, costCents: 6200 },
    { name: "iPhone 13 Screen (Premium)", sku: "SCR-IP13", category: "Screens", stock: 22, lowStockAt: 5, costCents: 4800 },
    { name: "Galaxy S24 OLED Screen", sku: "SCR-S24", category: "Screens", stock: 6, lowStockAt: 3, costCents: 13200 },
    { name: "Pixel 8 OLED Screen", sku: "SCR-PX8", category: "Screens", stock: 3, lowStockAt: 3, costCents: 9800 },
    { name: "iPad 10 Screen Assembly", sku: "SCR-IPAD10", category: "Screens", stock: 7, lowStockAt: 3, costCents: 5400 },
    { name: "iPhone 15 Battery", sku: "BAT-IP15", category: "Batteries", stock: 25, lowStockAt: 6, costCents: 1800 },
    { name: "iPhone 13 Battery", sku: "BAT-IP13", category: "Batteries", stock: 30, lowStockAt: 6, costCents: 1200 },
    { name: "Galaxy S23 Battery", sku: "BAT-S23", category: "Batteries", stock: 4, lowStockAt: 4, costCents: 1600 },
    { name: "MacBook Air M1 Battery", sku: "BAT-MBA-M1", category: "Batteries", stock: 5, lowStockAt: 2, costCents: 6800 },
    { name: "USB-C Charging Port (iPhone 15)", sku: "PRT-USBC-IP15", category: "Ports", stock: 15, lowStockAt: 5, costCents: 1400 },
    { name: "Lightning Charging Port Flex", sku: "PRT-LTG-FLX", category: "Ports", stock: 20, lowStockAt: 5, costCents: 900 },
    { name: "PS5 HDMI Port", sku: "PRT-HDMI-PS5", category: "Ports", stock: 10, lowStockAt: 3, costCents: 600 },
    { name: "Xbox Series X HDMI Port", sku: "PRT-HDMI-XBX", category: "Ports", stock: 8, lowStockAt: 3, costCents: 600 },
    { name: "iPhone Rear Camera Module", sku: "CAM-IP-REAR", category: "Cameras", stock: 9, lowStockAt: 3, costCents: 4200 },
    { name: "MacBook Pro 14\" LCD Panel", sku: "SCR-MBP14", category: "Screens", stock: 2, lowStockAt: 2, costCents: 28900 },
  ]);

  /* ---------- BLOG ---------- */
  await db.insert(blogPosts).values([
    {
      slug: "iphone-screen-repair-cost-philadelphia-2026",
      title: "How Much Does iPhone Screen Repair Cost in Philadelphia? (2026 Guide)",
      excerpt: "From the iPhone 11 to the iPhone 17 Pro Max — real local price ranges, aftermarket vs OEM screens, and how to avoid overpaying.",
      tag: "Pricing Guide",
      content: "Cracked screens are the most common repair we see at our Center City shop. In Philadelphia, third-party iPhone screen replacement typically runs $65–$275 depending on the model and screen grade.\n\nOlder models (iPhone 8 through 11) usually cost $65–$85. iPhone 12–14 models sit around $85–$110. The newest Pro and Pro Max models with premium OLED panels run $140–$275. Apple Store out-of-warranty service can exceed $300 for current Pro models.\n\nThe biggest factor is screen grade. Aftermarket LCD screens are cheapest but slightly dimmer. High-quality OLED aftermarket panels are nearly indistinguishable from original. Genuine OEM pulls cost the most but match factory specs exactly.\n\nOur advice: ask what grade of screen you're getting and what warranty backs it. A lifetime warranty on the part is the best protection you can buy.",
    },
    {
      slug: "phone-battery-replacement-signs",
      title: "5 Signs Your Phone Battery Needs Replacing",
      excerpt: "Dying before dinner? Random shutdowns at 30%? Here's how to tell a worn battery from a software problem — and what replacement costs.",
      tag: "Repair Tips",
      content: "Batteries are consumables — after 500 charge cycles, most lithium cells hold noticeably less charge. Here are the five signs we look for:\n\n1. Your phone dies before the end of a normal day, when it used to last.\n2. It shuts down unexpectedly at 20–40% charge.\n3. Battery health (Settings > Battery on iPhone) shows below 80%.\n4. The phone feels warm during light use or charging.\n5. The battery swells — a screen lifting from the frame is a swollen battery and a safety issue. Stop charging it and bring it in.\n\nBattery replacement is one of the fastest, cheapest repairs: most phones run $59–$99 and take 30 minutes. It can add 2–3 years of life to a phone that works perfectly otherwise.",
    },
    {
      slug: "water-damage-first-aid-phone",
      title: "Dropped Your Phone in Water? Do This First (Not Rice)",
      excerpt: "The rice trick is a myth. What actually saves a water-damaged phone — and why the first hour matters more than anything.",
      tag: "Emergency Guide",
      content: "Every week someone walks into our shop with a phone in a bag of rice. Here's the truth: rice does almost nothing, and the time it wastes is what kills the phone.\n\nWhat actually matters is power. Water itself rarely damages a phone — short circuits do. So: turn it off immediately. Don't charge it. Don't press buttons to 'test' it. If you can, remove the SIM tray to let air in.\n\nThen bring it to a repair shop as soon as possible — within hours, not days. Proper treatment means opening the device, disconnecting the battery, and cleaning the board with isopropyl alcohol or an ultrasonic cleaner to stop corrosion before it spreads.\n\nSuccess rates are highest (80%+) when a phone arrives within 24 hours, powered off. After a week of sitting in rice, corrosion often makes the board unrecoverable — and the data with it.",
    },
  ]);

  console.log("Done.");
  process.exit(0);
}

seed();
