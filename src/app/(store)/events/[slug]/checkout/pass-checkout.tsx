"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPHP } from "@/lib/utils";
import { fmtEventDate, timeRange, type PublicEvent } from "../../../_components/events";
import { ConfirmingOverlay, newIdempotencyKey, PayPanels, submitWithProof } from "../../../_components/pay-step";
import { ArrowLeftLine, CalendarBlank, MapPinLine } from "../../../_components/icons";
import { Btn, Container, Field, fieldCls, FormError, Panel } from "../../../_components/ui";
import { CheckoutSteps } from "../../../_components/checkout-steps";

export type PassLine = { sport_id: string; name: string; qty: number };

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
    if (!name.trim() || !email.trim() || !phone.trim()) return setError("Fill in your name, email and mobile number.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("That email address doesn't look right.");
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
    <Container className="pt-8 md:pt-12">
      {submitting ? <ConfirmingOverlay /> : null}
      {step === "pay" ? (
        <button
          type="button"
          onClick={() => setStep("details")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition"
        >
          <ArrowLeftLine className="w-4 h-4" /> Your details
        </button>
      ) : (
        <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition">
          <ArrowLeftLine className="w-4 h-4" /> {event.name}
        </Link>
      )}
      <h1 className="mt-6 font-display font-semibold tracking-[-0.04em] text-5xl text-s-fg">Get your passes</h1>
      <CheckoutSteps step={step} labels={["Your details", "Pay"]} />

      <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-start">
        <div className="md:col-span-7">
          {step === "details" ? (
            <form onSubmit={toPay} className="grid gap-5" noValidate>
              <Field label="Full name">
                <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Email" hint="Your QR passes go here.">
                  <input
                    className={fieldCls}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@gmail.com"
                  />
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
              {error ? <FormError>{error}</FormError> : null}
              <div>
                <Btn type="submit" arrow>
                  Continue to payment
                </Btn>
              </div>
            </form>
          ) : (
            <div className="grid gap-5">
              <PayPanels total={total} file={file} onFile={setFile} />
              {error ? <FormError>{error}</FormError> : null}
              <Btn onClick={submit} disabled={!file || submitting} arrow={!!file} className={file ? "w-full justify-between" : "w-full"}>
                I&apos;ve paid, get my passes
              </Btn>
            </div>
          )}
        </div>

        <aside className="md:col-span-5 md:sticky md:top-28">
          <Panel>
            <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-s-fg">{event.name}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-s-muted">
              <CalendarBlank className="w-4 h-4" />
              {fmtEventDate(event.event_date, "short")}
              {timeRange(event) ? `, ${timeRange(event)}` : ""}
            </p>
            {event.venue_name ? (
              <p className="mt-1.5 flex items-center gap-2 text-sm text-s-muted">
                <MapPinLine className="w-4 h-4" /> {event.venue_name}
              </p>
            ) : null}
            <ul className="mt-5 grid gap-2 text-sm border-t border-s-line/[0.08] pt-4">
              {lines.map((l) => (
                <li key={l.sport_id} className="flex justify-between text-s-fg">
                  <span>
                    {l.qty} × {l.name} pass
                  </span>
                  <span className="tabular-nums">{formatPHP(l.qty * price)}</span>
                </li>
              ))}
              {paddles ? (
                <li className="flex justify-between text-s-fg">
                  <span>{paddles} × Paddle rental</span>
                  <span className="tabular-nums">{formatPHP(paddles * paddlePrice)}</span>
                </li>
              ) : null}
            </ul>
            <div className="mt-4 flex justify-between border-t border-s-line/[0.08] pt-4 text-base font-semibold text-s-fg">
              <span>Total</span>
              <span className="tabular-nums">{formatPHP(total)}</span>
            </div>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
