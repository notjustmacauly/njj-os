"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatPHP } from "@/lib/utils";
import { cartTotals, useCart } from "../../_components/cart";
import { MixChips } from "../../_components/mix-chips";
import { ConfirmingOverlay, newIdempotencyKey, PayPanels, submitWithProof } from "../../_components/pay-step";
import { ArrowLeftLine } from "../../_components/icons";
import { Btn, Container, Field, fieldCls, FormError, Panel } from "../../_components/ui";
import { CheckoutSteps } from "../../_components/checkout-steps";

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
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const idemKey = React.useRef<string>("");

  React.useEffect(() => {
    idemKey.current = newIdempotencyKey();
  }, []);

  function toPay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
      return setError("Fill in your name, email, mobile number and delivery address.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("That email address doesn't look right.");
    if (!date || date < minDate) return setError("Choose a delivery date from tomorrow onwards.");
    setStep("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!file) return setError("Upload a screenshot of your payment.");
    setSubmitting(true);
    try {
      const token = await submitWithProof(
        "/api/shop/checkout",
        {
          idempotency_key: idemKey.current,
          name,
          email,
          phone,
          address,
          notes,
          first_delivery_date: date,
          items: lines.map((l) => ({ product_id: l.product_id, mix: l.mix })),
        },
        file,
      );
      clear();
      router.push(`/shop/order/${token}`);
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message);
    }
  }

  if (ready && lines.length === 0 && !submitting) {
    return (
      <Container className="pt-20 text-center">
        <p className="font-display text-3xl font-semibold text-s-fg">Your cart is empty.</p>
        <div className="mt-6">
          <Btn href="/shop" arrow>
            Build a pack
          </Btn>
        </div>
      </Container>
    );
  }

  const schedule = Array.from({ length: Math.max(t.weeks, 1) }, (_, i) => addDays(date || minDate, i * 7));

  return (
    <Container className="pt-8 md:pt-12">
      {submitting ? <ConfirmingOverlay /> : null}

      <button
        type="button"
        onClick={() => (step === "pay" ? setStep("details") : router.push("/shop/cart"))}
        className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition"
      >
        <ArrowLeftLine className="w-4 h-4" />
        {step === "pay" ? "Delivery details" : "Cart"}
      </button>
      <h1 className="mt-6 font-display font-semibold tracking-[-0.04em] text-5xl text-s-fg">Checkout</h1>
      <CheckoutSteps step={step} labels={["Delivery details", "Pay"]} />

      <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-start">
        <div className="md:col-span-7">
          {step === "details" ? (
            <form onSubmit={toPay} className="grid gap-5" noValidate>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Full name">
                  <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Mobile number">
                  <input
                    className={fieldCls}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0917 123 4567"
                  />
                </Field>
              </div>
              <Field label="Email" hint="Your order confirmation goes here.">
                <input
                  className={fieldCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@gmail.com"
                />
              </Field>
              <Field label="Delivery address">
                <textarea
                  className={fieldCls}
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="street-address"
                  placeholder="Unit 4B, 12 Osmeña Blvd, Barangay Kamputhaw, Cebu City"
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label={t.weeks > 1 ? "First delivery date" : "Delivery date"}>
                  <input className={fieldCls} type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Notes (optional)">
                  <input
                    className={fieldCls}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Gate code, landmark, best time"
                  />
                </Field>
              </div>
              {t.weeks > 1 ? (
                <div className="rounded-[20px] bg-s-sunken px-5 py-4">
                  <p className="text-sm font-semibold text-s-fg">Your deliveries</p>
                  <ol className="mt-2 flex flex-wrap gap-2">
                    {schedule.map((d) => (
                      <li key={d} className="rounded-full bg-s-surface px-3 py-1 text-xs font-semibold text-s-fg">
                        {prettyDate(d)}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {error ? <FormError>{error}</FormError> : null}
              <div>
                <Btn type="submit" arrow>
                  Continue to payment
                </Btn>
              </div>
            </form>
          ) : (
            <div className="grid gap-5">
              <PayPanels total={t.total} file={file} onFile={setFile} />
              {error ? <FormError>{error}</FormError> : null}
              <Btn onClick={submit} disabled={!file || submitting} arrow={!!file} className={file ? "w-full justify-between" : "w-full"}>
                I&apos;ve paid, place my order
              </Btn>
            </div>
          )}
        </div>

        <aside className="md:col-span-5 md:sticky md:top-28">
          <Panel>
            <p className="text-sm font-semibold text-s-fg">Order summary</p>
            <ul className="mt-4 grid gap-4">
              {lines.map((l) => (
                <li key={l.key} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-s-fg">{l.name}</span>
                    <span className="tabular-nums text-s-fg">{formatPHP(l.price)}</span>
                  </div>
                  <MixChips mix={l.mix} />
                </li>
              ))}
            </ul>
            <dl className="mt-5 grid gap-2 text-sm border-t border-s-line/[0.08] pt-4">
              <div className="flex justify-between">
                <dt className="text-s-muted">Delivery{t.weeks > 1 ? ` (${t.weeks} drops)` : ""}</dt>
                <dd className="tabular-nums text-s-fg">{formatPHP(t.delivery)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold text-s-fg">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPHP(t.total)}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
