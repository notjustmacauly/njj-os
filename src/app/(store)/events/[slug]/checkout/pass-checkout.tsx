"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { fmtEventDate, timeRange, type PublicEvent } from "../../../_components/events";
import { ConfirmingOverlay, newIdempotencyKey, PayPanels, submitWithProof } from "../../../_components/pay-step";

export type PassLine = { sport_id: string; name: string; qty: number };

const fieldCls =
  "w-full rounded-xl bg-white ring-1 ring-border px-4 py-3 text-ink placeholder:text-inkSoft/60 focus:outline-none focus:ring-2 focus:ring-berry";

export function PassCheckout({ event, lines, paddles }: { event: PublicEvent; lines: PassLine[]; paddles: number }) {
  const router = useRouter();
  const price = Number(event.pass_price);
  const paddlePrice = Number(event.paddle_price ?? 0);
  const total = lines.reduce((a, l) => a + l.qty * price, 0) + paddles * paddlePrice;

  const [step, setStep] = React.useState<"details" | "pay">("details");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const idemKey = React.useRef("");
  React.useEffect(() => {
    idemKey.current = newIdempotencyKey();
  }, []);

  function toPay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim()) return setError("Please fill in your name, email and mobile number.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("That email address doesn't look right.");
    setStep("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!file) return setError("Please upload a screenshot of your payment.");
    setSubmitting(true);
    try {
      const token = await submitWithProof(
        "/api/events/checkout",
        {
          idempotency_key: idemKey.current,
          name,
          email,
          phone,
          event_id: event.id,
          passes: lines.map((l) => ({ sport_id: l.sport_id, qty: l.qty })),
          paddles,
        },
        file,
      );
      router.push(`/shop/order/${token}`);
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {submitting ? <ConfirmingOverlay /> : null}
      {step === "pay" ? (
        <button type="button" onClick={() => setStep("details")} className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to details
        </button>
      ) : (
        <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to event
        </Link>
      )}
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">Get your passes</h1>
      <ol className="mt-3 flex gap-2 text-xs font-semibold">
        <li className={cn("rounded-full px-3 py-1", step === "details" ? "bg-berry text-white" : "bg-berryBg text-berry")}>1 · Your details</li>
        <li className={cn("rounded-full px-3 py-1", step === "pay" ? "bg-berry text-white" : "bg-ink/5 text-inkSoft")}>2 · Pay</li>
      </ol>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_340px] md:items-start">
        <div>
          {step === "details" ? (
            <form onSubmit={toPay} className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-ink">Full name</span>
                <input className={cn(fieldCls, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-semibold text-ink">Email</span>
                  <input className={cn(fieldCls, "mt-1")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  <span className="text-xs text-inkSoft">Your QR passes go here.</span>
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
              <PayPanels total={total} file={file} onFile={setFile} />
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
                I&apos;ve paid — get my passes
              </button>
            </div>
          )}
        </div>

        <aside className="rounded-3xl bg-white ring-1 ring-border p-6 md:sticky md:top-24">
          <div className="font-display font-semibold text-lg text-ink">{event.name}</div>
          <p className="mt-2 flex items-center gap-2 text-sm text-inkSoft">
            <CalendarDays className="w-4 h-4" /> {fmtEventDate(event.event_date, "short")}
            {timeRange(event) ? ` · ${timeRange(event)}` : ""}
          </p>
          {event.venue_name ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-inkSoft">
              <MapPin className="w-4 h-4" /> {event.venue_name}
            </p>
          ) : null}
          <ul className="mt-4 space-y-1.5 text-sm border-t border-border pt-3">
            {lines.map((l) => (
              <li key={l.sport_id} className="flex justify-between">
                <span>
                  {l.qty}× {l.name} pass
                </span>
                <span className="tabular-nums">{formatPHP(l.qty * price)}</span>
              </li>
            ))}
            {paddles ? (
              <li className="flex justify-between">
                <span>{paddles}× Paddle rental</span>
                <span className="tabular-nums">{formatPHP(paddles * paddlePrice)}</span>
              </li>
            ) : null}
          </ul>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatPHP(total)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
