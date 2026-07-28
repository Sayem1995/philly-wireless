import {
  Smartphone, Battery, Plug, Droplets, Camera, Volume2, Mic,
  Layers, Laptop, Tablet, Gamepad2, DatabaseBackup,
} from "lucide-react";

export const SERVICES = [
  { icon: Smartphone, title: "Screen Replacement", desc: "Cracked, shattered or unresponsive displays replaced with premium panels — most in under an hour.", price: "From $79" },
  { icon: Battery, title: "Battery Replacement", desc: "High-capacity tested cells that restore all-day battery life. 30-minute service.", price: "From $59" },
  { icon: Plug, title: "Charging Port Repair", desc: "Loose, corroded or dead USB-C and Lightning ports cleaned, repaired or replaced.", price: "From $69" },
  { icon: Layers, title: "Back Glass Replacement", desc: "Shattered back panels replaced with factory-finish glass and housing.", price: "From $99" },
  { icon: Camera, title: "Camera Repair", desc: "Blurry photos, cracked lenses and failed camera modules fixed fast.", price: "From $89" },
  { icon: Volume2, title: "Speaker Repair", desc: "Muffled, crackling or silent speakers restored to full clarity.", price: "From $59" },
  { icon: Mic, title: "Microphone Repair", desc: "Callers can't hear you? Mic mesh cleaning and flex replacement.", price: "From $59" },
  { icon: Droplets, title: "Water Damage Repair", desc: "Ultrasonic cleaning and board-level treatment for liquid damage.", price: "From $99" },
  { icon: Tablet, title: "iPad & Tablet Repair", desc: "Screens and batteries for iPad, Galaxy Tab and Android tablets.", price: "From $89" },
  { icon: Laptop, title: "Laptop & MacBook Repair", desc: "Screens, batteries, keyboards and board-level MacBook repair.", price: "From $99" },
  { icon: Gamepad2, title: "Console HDMI Repair", desc: "PS5 and Xbox HDMI port replacement with micro-soldering precision.", price: "Call for pricing" },
  { icon: DatabaseBackup, title: "Data Recovery", desc: "Photos, contacts and files recovered from dead or damaged devices.", price: "From $149" },
];

export const TESTIMONIALS = [
  { text: "Fixed my iPhone 14 Pro screen in 25 minutes. Quality is indistinguishable from original, and the lifetime warranty gives real peace of mind.", name: "Sarah Mitchell", area: "Center City" },
  { text: "Dropped my Samsung in the Schuylkill and thought it was done. They recovered all my data and replaced the charging port the same day.", name: "James Rodriguez", area: "University City" },
  { text: "Best prices in Philly for iPad repairs. Professional staff, clean shop, and they explained everything before touching anything.", name: "Emily Chen", area: "Rittenhouse" },
  { text: "PS5 HDMI port died two days before a tournament. They micro-soldered a new one that same afternoon. Absolute lifesavers.", name: "Marcus Thompson", area: "South Philly" },
];

export const FAQS = [
  { q: "How long does a repair take?", a: "Most screen and battery replacements are completed in 30–60 minutes. Complex repairs like water damage or board-level work may take 24–48 hours. We always give an accurate time estimate before starting." },
  { q: "Do you use OEM parts?", a: "We use premium-quality parts that meet or exceed OEM specifications, and for iPhones we offer both high-grade aftermarket and genuine Apple parts. All parts are backed by warranty." },
  { q: "What warranty do you offer?", a: "Lifetime warranty on screen repairs, 90 days on batteries and all other repairs. If a part we installed fails under normal use, we replace it free." },
  { q: "Do I need an appointment?", a: "No — walk-ins are always welcome at 1033 Chestnut Street. Booking online guarantees your time slot and priority service." },
  { q: "Is my data safe during repair?", a: "Absolutely. We never access personal data, follow strict privacy protocols, and most repairs never require your passcode. We recommend a backup as a precaution." },
  { q: "Do you buy or trade in phones?", a: "Yes — we buy used iPhones, Samsungs and Pixels for cash or store credit, and every refurbished device we sell includes a 1-year store warranty." },
  { q: "Can you recover data from a dead phone?", a: "In most cases, yes. Our board-level technicians recover photos, contacts and files from water-damaged and non-booting devices. Diagnostics are free." },
  { q: "Where are you located?", a: "1033 Chestnut Street in Center City Philadelphia — two blocks from Jefferson Station, with garages nearby on 11th and Chestnut." },
];

export const STATS = [
  { value: 20000, suffix: "+", label: "Devices Repaired" },
  { value: 15, suffix: " yrs", label: "Serving Philadelphia" },
  { value: 4.9, decimals: 1, suffix: "★", label: "Google Rating" },
  { value: 30, suffix: " min", label: "Average Repair" },
];

export const PROCESS = [
  { n: "01", title: "Check In", desc: "Walk in or book online. We log your device and give you a repair ticket with live status." },
  { n: "02", title: "Free Diagnosis", desc: "Full hardware diagnostic — free, no obligation. You approve the quote before we touch a screw." },
  { n: "03", title: "Precision Repair", desc: "Certified technicians, anti-static benches, premium parts. Most repairs done in 30–60 minutes." },
  { n: "04", title: "Quality Testing", desc: "Every device passes a 25-point functional test — touch, cameras, sensors, charging, signal." },
  { n: "05", title: "Pickup & Warranty", desc: "Walk out with a working device and a written warranty card. Screen repairs: lifetime coverage." },
];
