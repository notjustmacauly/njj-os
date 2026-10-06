import { cn } from "@/lib/utils";

/** Two-step progress for checkouts (details, then pay). */
export function CheckoutSteps({ step, labels }: { step: "details" | "pay"; labels: [string, string] }) {
  const idx = step === "details" ? 0 : 1;
  return (
    <ol className="mt-5 flex items-center gap-3 text-sm">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-semibold transition duration-300 ease-settle",
              i === idx ? "bg-s-invert text-s-invert-fg" : i < idx ? "bg-s-sunken text-s-fg" : "text-s-muted ring-1 ring-s-line/15",
            )}
            aria-current={i === idx ? "step" : undefined}
          >
            {l}
          </span>
          {i === 0 ? <span className="h-px w-6 bg-s-line/20" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
