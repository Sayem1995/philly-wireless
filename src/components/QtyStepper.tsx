import { Minus, Plus } from "lucide-react";

/** Small quantity control shared by the cart drawer and the cart page. */
export default function QtyStepper({
  qty,
  max,
  onChange,
  disabled = false,
}: {
  qty: number;
  max: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-ink/15 bg-white">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={disabled}
        aria-label={qty <= 1 ? "Remove from cart" : "Decrease quantity"}
        className="w-8 h-8 grid place-items-center rounded-full text-ink/60 hover:text-burgundy disabled:opacity-40 transition-colors"
      >
        <Minus size={13} />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={disabled || qty >= max}
        aria-label="Increase quantity"
        className="w-8 h-8 grid place-items-center rounded-full text-ink/60 hover:text-burgundy disabled:opacity-40 transition-colors"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
