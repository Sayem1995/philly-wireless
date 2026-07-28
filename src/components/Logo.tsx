export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={`w-10 h-10 rounded-xl grid place-items-center overflow-hidden ${light ? "bg-blush" : ""}`}>
        <img src="/logo-icon.png" alt="Philly Phone Repair logo" className="w-9 h-9 object-contain" />
      </span>
      <span className="leading-none">
        <span className={`block font-serif text-lg font-bold ${light ? "text-ivory" : "text-ink"}`}>
          Philly <span className="text-burgundy">Phone Repair</span>
        </span>
        <span className={`block text-[10px] tracking-[0.25em] uppercase mt-1 ${light ? "text-blush" : "text-burgundy/70"}`}>
          Center City · Est. 2011
        </span>
      </span>
    </span>
  );
}
