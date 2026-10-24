import { useState } from "react";
import { Search } from "lucide-react";
import { BOOKING_MODELS } from "@contracts/deviceModels";
import { estimateRepair, REPAIR_ESTIMATE_NOTE } from "@contracts/repairEstimates";
import { STORE } from "@contracts/constants";

type LookupDevice = {
  deviceType: "Phone" | "Tablet" | "Laptop";
  brand: string;
  model: string;
};

const SERVICES = [
  "Cracked Screen",
  "Battery Replacement",
  "Charging Port Repair",
  "Back Glass Replacement",
  "Camera Repair",
  "Water Damage Repair",
  "Speaker / Mic Repair",
];

const LOOKUPS: LookupDevice[] = [
  ...BOOKING_MODELS.Apple
    .filter((model) => model.startsWith("iPhone") && !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Phone" as const, brand: "Apple", model })),
  ...BOOKING_MODELS.Samsung
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Phone" as const, brand: "Samsung", model })),
  ...BOOKING_MODELS.Google
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Phone" as const, brand: "Google", model })),
  ...BOOKING_MODELS.Motorola
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Phone" as const, brand: "Motorola", model })),
  ...BOOKING_MODELS.OnePlus
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Phone" as const, brand: "OnePlus", model })),
  ...BOOKING_MODELS["Apple iPad"]
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Tablet" as const, brand: "Apple iPad", model })),
  ...BOOKING_MODELS["Samsung Galaxy Tab"]
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Tablet" as const, brand: "Samsung Galaxy Tab", model })),
  ...BOOKING_MODELS["Apple MacBook"]
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Laptop" as const, brand: "Apple MacBook", model })),
  ...BOOKING_MODELS["Windows Laptop"]
    .filter((model) => !model.startsWith("Other"))
    .map((model) => ({ deviceType: "Laptop" as const, brand: "Windows Laptop", model })),
];

function keyOf(device: LookupDevice) {
  return `${device.deviceType}|${device.brand}|${device.model}`;
}

export default function ModelPriceLookup() {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = LOOKUPS.find((device) => keyOf(device) === selectedKey) ?? null;
  const needle = query.trim().toLowerCase();
  const matches = needle.length >= 2
    ? LOOKUPS.filter((device) =>
        `${device.brand} ${device.model}`.toLowerCase().includes(needle),
      ).slice(0, 8)
    : [];

  return (
    <div className="rounded-3xl border border-blush bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-ink">Find your model price</h2>
        <p className="mt-1 text-sm text-ink/50">
          Search any iPhone, Samsung, Pixel, Motorola, iPad or MacBook.
        </p>
      </div>

      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedKey(null);
          }}
          placeholder="Try “iPhone 16”, “Galaxy S24” or “MacBook Air”"
          aria-label="Search model prices"
          className="w-full rounded-2xl border border-ink/15 bg-ivory py-3.5 pl-11 pr-4 text-sm text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-burgundy"
        />
      </div>

      {matches.length > 0 && !selected && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-blush">
          {matches.map((device) => (
            <button
              key={keyOf(device)}
              type="button"
              onClick={() => setSelectedKey(keyOf(device))}
              className="flex w-full items-center justify-between border-b border-blush/60 px-4 py-3 text-left text-sm last:border-0 hover:bg-blush-light"
            >
              <span>
                <span className="font-medium text-ink">{device.model}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wide text-ink/35">
                  {device.deviceType}
                </span>
              </span>
              <span className="text-[11px] text-burgundy">View prices</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{selected.model}</p>
            <button
              type="button"
              onClick={() => {
                setSelectedKey(null);
                setQuery("");
              }}
              className="text-[11px] text-ink/40 underline underline-offset-2 hover:text-burgundy"
            >
              Change model
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-blush">
            <table className="w-full text-left text-sm">
              <thead className="bg-blush-light text-[10px] uppercase tracking-[0.14em] text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Repair</th>
                  <th className="px-4 py-3 text-right font-medium">Starting price</th>
                </tr>
              </thead>
              <tbody>
                {SERVICES.map((service) => {
                  const estimate = estimateRepair(
                    selected.deviceType,
                    selected.brand,
                    selected.model,
                    service,
                  );
                  if (!estimate) return null;
                  return (
                    <tr key={service} className="border-t border-blush/60">
                      <td className="px-4 py-3 text-ink/70">{service}</td>
                      <td className="px-4 py-3 text-right font-semibold text-burgundy">
                        {estimate.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink/40">{REPAIR_ESTIMATE_NOTE}</p>
        </div>
      )}

      {needle.length >= 2 && matches.length === 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          No model found. Try a shorter search, or call {STORE.phone} for a quote.
        </p>
      )}
    </div>
  );
}
