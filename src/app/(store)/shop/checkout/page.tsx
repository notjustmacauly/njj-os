"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImageUp, Loader2 } from "lucide-react";
import { COMPANY } from "@/lib/company";
import { cn, formatPHP } from "@/lib/utils";
import { cartTotals, useCart } from "../../_components/cart";
import { MixChips } from "../../_components/mix-chips";

function manilaDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Shrink big phone screenshots before upload (server functions cap request
// size ~6 MB). Falls back to the original if the browser can't decode it.
async function shrinkImage(file: File): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const fieldCls =
  "w-full rounded-xl bg-white ring-1 ring-border px-4 py-3 text-ink placeholder:text-inkSoft/60 focus:outline-none focus:ring-2 focus:ring-berry";

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, ready, clear } = useCart();
  const t = cartTotals(lines);
  const minDate = manilaDate(1);

  const [step, setStep] = React.useState<"details" | "pay">("details");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [date, setDate] = React.useState(minDate);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const idemKey = React.useRef<string>("");

  React.useEffect(() => {
    idemKey.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function toPay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
      return setError("Please fill in your name, email, mobile number and delivery address.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("That email address doesn't look right.");
    if (!date || date < minDate) return setError("Please choose a delivery date from tomorrow onwards.");
    setStep("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!file) return setError("Please upload a screenshot of your payment.");

    setSubmitting(true);
    const started = Date.now();
    const upload = await shrinkImage(file);
    if (upload.size > 5.5 * 1024 * 1024) {
      setSubmitting(false);
      return setError("That image is too large — please send a regular screenshot instead.");
    }
    const body = new FormData();
    body.append(
      "payload",
      JSON.stringify({
        idempotency_key: idemKey.current,
        name,
        email,
        phone,
        address,
        notes,
        first_delivery_date: date,
        items: lines.map((l) => ({ product_id: l.product_id, mix: l.mix })),
      }),
    );
    body.append("proof", upload);

    try {
      const res = await fetch("/api/shop/checkout", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      // Keep the "confirming" moment on screen long enough to read.
      const wait = 1800 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (!res.ok || !json.token) {
        setSubmitting(false);
        setError(json.error ?? "Something went wrong — please try again.");
        return;
      }
      clear();
      router.push(`/shop/order/${json.token}`);
    } catch {
      setSubmitting(false);
      setError("We couldn't reach the server — check your connection and try again.");
    }
  }

  if (ready && lines.length === 0 && !submitting) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-inkSoft">Your cart is empty.</p>
        <Link href="/shop" className="mt-5 inline-flex rounded-full bg-berry text-white font-semibold px-6 py-3">
          Build a pack
        </Link>
      </div>
    );
  }

  const schedule = Array.from({ length: Math.max(t.weeks, 1) }, (_, i) => addDays(date || minDate, i * 7));

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {submitting ? (
        <div className="fixed inset-0 z-[60] bg-cream/95 backdrop-blur flex flex-col items-center justify-center text-center px-6">
          <Loader2 className="w-10 h-10 text-berry animate-spin" />
          <p className="mt-5 font-display text-2xl font-semibold text-ink">Confirming your payment…</p>
          <p className="mt-1 text-inkSoft">Hang tight, this only takes a moment.</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => (step === "pay" ? setStep("details") : router.push("/shop/cart"))}
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {step === "pay" ? "Back to details" : "Back to cart"}
      </button>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">Checkout</h1>
      <ol className="mt-3 flex gap-2 text-xs font-semibold">
        <li className={cn("rounded-full px-3 py-1", step === "details" ? "bg-berry text-white" : "bg-berryBg text-berry")}>
          1 · Delivery details
        </li>
        <li className={cn("rounded-full px-3 py-1", step === "pay" ? "bg-berry text-white" : "bg-ink/5 text-inkSoft")}>
          2 · Pay
        </li>
      </ol>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_340px] md:items-start">
        <div>
          {step === "details" ? (
            <form onSubmit={toPay} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-semibold text-ink">Full name</span>
                  <input className={cn(fieldCls, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-ink">Mobile number</span>
                  <input
                    className={cn(fieldCls, "mt-1")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="09xx xxx xxxx"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-ink">Email</span>
                <input
                  className={cn(fieldCls, "mt-1")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                />
                <span className="text-xs text-inkSoft">Your order confirmation goes here.</span>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink">Delivery address</span>
                <textarea
                  className={cn(fieldCls, "mt-1")}
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="street-address"
                  placeholder="House / unit, street, barangay, city"
                />
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-semibold text-ink">
                    {t.weeks > 1 ? "First delivery date" : "Delivery date"}
                  </span>
                  <input
                    className={cn(fieldCls, "mt-1")}
                    type="date"
                    min={minDate}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-ink">Notes (optional)</span>
                  <input
                    className={cn(fieldCls, "mt-1")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Gate code, landmark, best time…"
                  />
                </label>
              </div>
              {t.weeks > 1 ? (
                <div className="rounded-2xl bg-white ring-1 ring-border px-4 py-3 text-sm">
                  <div className="font-semibold text-ink">Your deliveries</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {schedule.map((d, i) => (
                      <span key={d} className="rounded-full bg-cream ring-1 ring-border px-2.5 py-0.5 text-xs">
                        {i + 1}. {prettyDate(d)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {error ? <p className="text-sm text-coral font-semibold">{error}</p> : null}
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-berry text-white font-semibold px-8 py-3.5 hover:bg-berryLt transition shadow-lg shadow-berry/20"
              >
                Continue to payment
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="rounded-3xl bg-white ring-1 ring-border p-6">
                <div className="text-sm font-semibold text-ink">1. Scan and pay exactly</div>
                <div className="mt-1 font-display text-4xl font-semibold text-berry tabular-nums">{formatPHP(t.total)}</div>
                <div className="mt-4 flex flex-col sm:flex-row gap-5 sm:items-center">
                  <div className="relative w-56 h-56 shrink-0 rounded-2xl overflow-hidden ring-1 ring-border bg-white">
                    <Image src={COMPANY.payQrSrc} alt="Payment QR code" fill sizes="224px" className="object-contain" />
                  </div>
                  <p className="text-sm text-inkSoft">
                    Scan with GCash, Maya or any bank app (InstaPay). On your phone? Screenshot this QR and open it from
                    your banking app.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl bg-white ring-1 ring-border p-6">
                <div className="text-sm font-semibold text-ink">2. Upload your payment screenshot</div>
                <label
                  className={cn(
                    "mt-3 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 cursor-pointer transition text-center",
                    file ? "border-berry/40 bg-berryBg/40" : "border-border hover:border-berry/40",
                  )}
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Your payment screenshot" className="max-h-64 rounded-lg" />
                  ) : (
                    <>
                      <ImageUp className="w-8 h-8 text-berry" />
                      <span className="text-sm font-semibold text-ink">Tap to choose your screenshot</span>
                      <span className="text-xs text-inkSoft">JPG or PNG, up to 10 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {file ? (
                  <button type="button" onClick={() => setFile(null)} className="mt-2 text-xs text-inkSoft underline">
                    Choose a different image
                  </button>
                ) : null}
              </div>

              {error ? <p className="text-sm text-coral font-semibold">{error}</p> : null}
              <button
                type="button"
                onClick={submit}
                disabled={!file || submitting}
                className={cn(
                  "w-full inline-flex items-center justify-center rounded-full font-semibold px-8 py-3.5 transition",
                  file ? "bg-berry text-white hover:bg-berryLt shadow-lg shadow-berry/20" : "bg-ink/10 text-inkSoft cursor-not-allowed",
                )}
              >
                I&apos;ve paid — place my order
              </button>
            </div>
          )}
        </div>

        {/* Summary */}
        <aside className="rounded-3xl bg-white ring-1 ring-border p-6 md:sticky md:top-24">
          <div className="text-sm font-semibold text-ink">Order summary</div>
          <ul className="mt-3 space-y-3">
            {lines.map((l) => (
              <li key={l.key} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold text-ink">{l.name}</span>
                  <span className="tabular-nums">{formatPHP(l.price)}</span>
                </div>
                <MixChips mix={l.mix} />
              </li>
            ))}
          </ul>
          <dl className="mt-4 text-sm space-y-1.5 border-t border-border pt-3">
            <div className="flex justify-between">
              <dt className="text-inkSoft">Delivery{t.weeks > 1 ? ` (${t.weeks} drops)` : ""}</dt>
              <dd className="tabular-nums">{formatPHP(t.delivery)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPHP(t.total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
