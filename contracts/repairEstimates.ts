/**
 * Market-based starting prices.
 *
 * These are deliberately labels ("From $…") rather than exact quotes: part
 * grades, generation and condition move the final number. They are calibrated
 * from current third-party repair ranges and are used to give every booking
 * model a useful starting point before the free diagnostic.
 */

export type RepairEstimate = {
  label: string;
  fromCents: number;
  note: string;
};

type Tier = "premium" | "flagship" | "mid" | "budget" | "legacy";
type Service =
  | "Cracked Screen"
  | "Battery Replacement"
  | "Charging Port Repair"
  | "Back Glass Replacement"
  | "Camera Repair"
  | "Water Damage Repair"
  | "Speaker / Mic Repair"
  | "Not sure — free diagnostic";

const PHONE_PRICES: Record<
  Tier,
  Record<Exclude<Service, "Not sure — free diagnostic">, number>
> = {
  premium: {
    "Cracked Screen": 24900,
    "Battery Replacement": 9900,
    "Charging Port Repair": 10900,
    "Back Glass Replacement": 13900,
    "Camera Repair": 15900,
    "Water Damage Repair": 12900,
    "Speaker / Mic Repair": 9900,
  },
  flagship: {
    "Cracked Screen": 18900,
    "Battery Replacement": 8900,
    "Charging Port Repair": 8900,
    "Back Glass Replacement": 11900,
    "Camera Repair": 12900,
    "Water Damage Repair": 10900,
    "Speaker / Mic Repair": 8900,
  },
  mid: {
    "Cracked Screen": 13900,
    "Battery Replacement": 6900,
    "Charging Port Repair": 7900,
    "Back Glass Replacement": 9900,
    "Camera Repair": 9900,
    "Water Damage Repair": 9900,
    "Speaker / Mic Repair": 7900,
  },
  budget: {
    "Cracked Screen": 10900,
    "Battery Replacement": 5900,
    "Charging Port Repair": 6900,
    "Back Glass Replacement": 7900,
    "Camera Repair": 7900,
    "Water Damage Repair": 8900,
    "Speaker / Mic Repair": 6900,
  },
  legacy: {
    "Cracked Screen": 7900,
    "Battery Replacement": 4900,
    "Charging Port Repair": 5900,
    "Back Glass Replacement": 6900,
    "Camera Repair": 6900,
    "Water Damage Repair": 7900,
    "Speaker / Mic Repair": 5900,
  },
};

const NOTE = "Starting estimate. Final quote is confirmed after the free diagnostic.";

function phoneTier(brand: string, model: string): Tier {
  const m = model.toLowerCase();

  if (brand === "Apple") {
    if (m.includes("air") || /iphone 1[567].*(pro|max)/.test(m)) return "premium";
    if (m.includes("16e") || m.includes("17e")) return "mid";
    if (/iphone 1[34567]/.test(m)) return "flagship";
    if (/iphone (1[12]|xs|xr|se \(3)/.test(m)) return "mid";
    if (/iphone (x|8|7|se \(2)/.test(m)) return "budget";
    return "legacy";
  }

  if (brand === "Samsung") {
    if (/z fold/.test(m)) return "premium";
    if (/z flip/.test(m)) return "premium";
    if (/s2[3456].*(ultra|\+)/.test(m)) return "premium";
    if (/note|s2[23456]/.test(m)) return "flagship";
    if (/a[5-9]|xcover/.test(m)) return "mid";
    if (/a[1-4]/.test(m)) return "budget";
    return "legacy";
  }

  if (brand === "Google") {
    if (/pro|fold/.test(m)) return "premium";
    if (/pixel (8|9|10)/.test(m)) return "flagship";
    if (/pixel (6|7)/.test(m)) return "mid";
    if (/pixel (4|5)/.test(m)) return "budget";
    return "legacy";
  }

  if (brand === "Motorola") {
    if (/razr|edge/.test(m)) return "premium";
    if (/g power|g stylus/.test(m)) return "mid";
    if (/moto g|moto e/.test(m)) return "budget";
    return "legacy";
  }

  if (brand === "OnePlus") return /nord/.test(m) ? "mid" : "flagship";
  return "mid";
}

function phoneEstimate(brand: string, model: string, service: Service): RepairEstimate | null {
  if (service === "Not sure — free diagnostic") {
    return { label: "Free diagnostic", fromCents: 0, note: NOTE };
  }
  const tier = phoneTier(brand, model);
  let cents = PHONE_PRICES[tier][service];

  if (brand === "Apple" && tier === "premium") cents += 3000;
  if (brand === "Samsung") {
    if (/z fold/i.test(model)) cents += 10000;
    if (/z flip/i.test(model)) cents += 5000;
    if (/ultra/i.test(model)) cents += 2000;
  }
  if (brand === "Google" && /fold/i.test(model)) cents += 5000;

  return {
    label: `From $${(cents / 100).toFixed(0)}`,
    fromCents: cents,
    note: NOTE,
  };
}

function ipadEstimate(model: string, service: Service): RepairEstimate | null {
  const m = model.toLowerCase();
  let screen = 16900;
  if (/pro/.test(m)) screen = /13|12\.9/.test(m) ? 49900 : 39900;
  else if (/air/.test(m)) screen = /13/.test(m) ? 29900 : 24900;
  else if (/mini/.test(m)) screen = 19900;
  else if (/10th|11th|9th|8th|7th/.test(m)) screen = 16900;
  else screen = 14900;

  const battery = /pro/.test(m) ? 12900 : /air/.test(m) ? 10900 : 8900;
  const prices: Partial<Record<Service, number>> = {
    "Cracked Screen": screen,
    "Battery Replacement": battery,
    "Charging Port Repair": 9900,
    "Camera Repair": 12900,
    "Water Damage Repair": 14900,
    "Speaker / Mic Repair": 9900,
  };
  if (service === "Not sure — free diagnostic") {
    return { label: "Free diagnostic", fromCents: 0, note: NOTE };
  }
  const cents = prices[service];
  return cents ? { label: `From $${(cents / 100).toFixed(0)}`, fromCents: cents, note: NOTE } : null;
}

function galaxyTabEstimate(model: string, service: Service): RepairEstimate | null {
  const m = model.toLowerCase();
  let screen = 14900;
  if (/ultra/.test(m)) screen = 34900;
  else if (/s10|s9|s8/.test(m)) screen = /\+/.test(m) ? 29900 : 24900;
  else if (/s9 fe|s8|s7/.test(m)) screen = 19900;
  else if (/active/.test(m)) screen = 19900;

  const prices: Partial<Record<Service, number>> = {
    "Cracked Screen": screen,
    "Battery Replacement": 9900,
    "Charging Port Repair": 8900,
    "Camera Repair": 9900,
    "Water Damage Repair": 12900,
    "Speaker / Mic Repair": 8900,
  };
  if (service === "Not sure — free diagnostic") {
    return { label: "Free diagnostic", fromCents: 0, note: NOTE };
  }
  const cents = prices[service];
  return cents ? { label: `From $${(cents / 100).toFixed(0)}`, fromCents: cents, note: NOTE } : null;
}

function macbookEstimate(model: string, service: Service): RepairEstimate | null {
  const m = model.toLowerCase();
  let screen = 34900;
  if (/pro/.test(m)) {
    if (/16/.test(m)) screen = 79900;
    else if (/14/.test(m)) screen = 69900;
    else if (/15/.test(m)) screen = 54900;
    else screen = 44900;
  } else if (/air/.test(m)) {
    screen = /15/.test(m) ? 44900 : 39900;
  }

  const battery = /pro/.test(m) ? 14900 : /air/.test(m) ? 12900 : 9900;
  const prices: Partial<Record<Service, number>> = {
    "Cracked Screen": screen,
    "Battery Replacement": battery,
    "Charging Port Repair": 14900,
    "Camera Repair": 12900,
    "Water Damage Repair": 17900,
    "Speaker / Mic Repair": 12900,
  };
  if (service === "Not sure — free diagnostic") {
    return { label: "Free diagnostic", fromCents: 0, note: NOTE };
  }
  const cents = prices[service];
  return cents ? { label: `From $${(cents / 100).toFixed(0)}`, fromCents: cents, note: NOTE } : null;
}

function windowsLaptopEstimate(service: Service): RepairEstimate | null {
  const prices: Partial<Record<Service, number>> = {
    "Cracked Screen": 19900,
    "Battery Replacement": 12900,
    "Charging Port Repair": 11900,
    "Camera Repair": 9900,
    "Water Damage Repair": 14900,
    "Speaker / Mic Repair": 9900,
  };
  if (service === "Not sure — free diagnostic") {
    return { label: "Free diagnostic", fromCents: 0, note: NOTE };
  }
  const cents = prices[service];
  return cents ? { label: `From $${(cents / 100).toFixed(0)}`, fromCents: cents, note: NOTE } : null;
}

function consoleEstimate(service: Service): RepairEstimate | null {
  if (service === "Not sure — free diagnostic") {
    return { label: "Free diagnostic", fromCents: 0, note: NOTE };
  }
  if (service === "Charging Port Repair") {
    return { label: "From $129", fromCents: 12900, note: NOTE };
  }
  return null;
}

export function estimateRepair(
  deviceType: string,
  brand: string,
  model: string,
  service: string,
): RepairEstimate | null {
  const normalized = service as Service;
  if (deviceType === "Phone") return phoneEstimate(brand, model, normalized);
  if (deviceType === "Tablet") {
    if (brand === "Apple iPad") return ipadEstimate(model, normalized);
    if (brand === "Samsung Galaxy Tab") return galaxyTabEstimate(model, normalized);
    return windowsLaptopEstimate(normalized);
  }
  if (deviceType === "Laptop") {
    if (brand === "Apple MacBook") return macbookEstimate(model, normalized);
    return windowsLaptopEstimate(normalized);
  }
  if (deviceType === "Console") return consoleEstimate(normalized);
  return null;
}

export const REPAIR_ESTIMATE_NOTE = NOTE;
