"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatPHP } from "@/lib/utils";
import { fmtEventDate, timeRange, type PublicEvent } from "../../../_components/events";
import { ConfirmingOverlay, newIdempotencyKey, PayPanels, submitWithProof } from "../../../_components/pay-step";
import { ArrowLeftLine, CalendarBlank, MapPinLine, MinusLine, PlusLine, UserLine, UsersLine, WalletLine } from "../../../_components/icons";
import { Btn, Container, Field, fieldCls, FormError, Panel } from "../../../_components/ui";
import { CheckoutSteps } from "../../../_components/checkout-steps";
import { useMemberPrefill } from "../../../account/account-client";

export type PassLine = { sport_id: string; name: string; qty: number };
export type PassPrices = { pass_price: number; bundle_size: number; bundle_price: number };
type Holder = { sport_id: string; sport: string; me: boolean; name: string; email: string };

/** Mirrors web_place_pass_checkout: wallet first, then the bundle, then ₱ per pass. */
export function passTotals(count: number, useWallet: number, bundles: number, p: PassPrices, paddles = 0, paddlePrice = 0) {
  const cash = count - useWallet;
  const fromBundle = Math.min(cash, bundles * p.bundle_size);
  const pay = cash - fromBundle;
  return {
    fromBundle,
    pay,
    leftover: bundles * p.bundle_size - fromBundle,
    total: pay * p.pass_price + bundles * p.bundle_price + paddles * paddlePrice,
  };
}

function Stepper({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const b = "w-9 h-9 rounded-full ring-1 ring-s-line/15 flex items-center justify-center text-s-fg transition hover:bg-s-line/[0.05] active:scale-[0.95] disabled:opacity-25";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0} aria-label="Fewer" className={b}>
        <MinusLine className="w-4 h-4" />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums text-s-fg">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More" className={b}>
        <PlusLine className="w-4 h-4" />
      </button>
    </div>
  );
}

export function PassCheckout({ event, lines, paddles, prices }: { event: PublicEvent; lines: PassLine[]; paddles: number; prices: PassPrices }) {
  const router = useRouter();
  const paddlePrice = Number(event.paddle_price ?? 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);

  const [step, setStep] = React.useState<"details" | "pay">("details");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [holders, setHolders] = React.useState<Holder[]>(() =>
    lines.flatMap((l) => Array.from({ length: l.qty }, () => ({ sport_id: l.sport_id, sport: l.name, me: false, name: "", email: "" }))).map((h, i) => ({ ...h, me: i === 0 })),
  );
  const [member, setMember] = React.useState<{ wallet: number } | null>(null);
  const [useWallet, setUseWallet] = React.useState(0);
  const [bundle, setBundle] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const idemKey = React.useRef("");
  React.useEffect(() => {
    idemKey.current = newIdempotencyKey();
  }, []);
  // Signed-in customers: prefill, and offer their pass wallet.
  useMemberPrefill((m) => {
    setName((v) => v || m.name);
    setEmail((v) => v || m.email);
    setPhone((v) => v || m.phone);
    if (m.confirmed) {
      setMember({ wallet: m.wallet });
      setUseWallet(Math.min(m.wallet, count));
    }
  });

  const bundles = bundle ? 1 : 0;
  const t = passTotals(count, useWallet, bundles, prices, paddles, paddlePrice);
  const noBundleTotal = passTotals(count, useWallet, 0, prices, paddles, paddlePrice).total;
  const remaining = count - useWallet;
  // A bundle saves money once 4 passes at ₱255 would cost more than ₱980.
  const bundleSaves = prices.bundle_size * prices.pass_price - prices.bundle_price;

  const setHolder = (i: number, v: Partial<Holder>) =>
    setHolders((hs) => hs.map((h, j) => (j === i ? { ...h, ...v } : v.me ? { ...h, me: false } : h)));

  function validate(): string | null {
    if (!name.trim() || !email.trim() || !phone.trim()) return "Fill in your name, email and mobile number.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return "That email address doesn't look right.";
    for (let i = 0; i < holders.length; i++) {
      const h = holders[i];
      if (!h.me && !h.name.trim()) return `Add the player's name for pass ${i + 1}.`;
      if (!h.me && h.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(h.email.trim())) return `Pass ${i + 1}: that email doesn't look right.`;
    }
    return null;
  }

  async function send(withFile: File | null) {
    if (submitting) return;
    setError(null);
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
          holders: holders.map((h) => (h.me ? { sport_id: h.sport_id } : { sport_id: h.sport_id, name: h.name.trim(), email: h.email.trim() })),
          paddles,
          use_wallet: useWallet,
          bundles,
        },
        withFile,
      );
      router.push(`/shop/order/${token}`);
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message);
    }
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) return setError(err);
    setError(null);
    if (t.total === 0) return send(null);
    setStep("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Container className="pt-8 md:pt-12">
      {submitting ? <ConfirmingOverlay /> : null}
      {step === "pay" ? (
        <button type="button" onClick={() => setStep("details")} className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition">
          <ArrowLeftLine className="w-4 h-4" /> Players
        </button>
      ) : (
        <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition">
          <ArrowLeftLine className="w-4 h-4" /> {event.name}
        </Link>
      )}
      <h1 className="mt-6 font-display font-semibold tracking-[-0.04em] text-5xl text-s-fg">Get your passes</h1>
      <CheckoutSteps step={step} labels={["Players", "Pay"]} />

      <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-start">
        <div className="md:col-span-7">
          {step === "details" ? (
            <form onSubmit={next} className="grid gap-8" noValidate>
              <div className="grid gap-5">
                <Field label="Your name">
                  <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Email" hint="Your QR passes go here.">
                    <input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@gmail.com" />
                  </Field>
                  <Field label="Mobile number">
                    <input className={fieldCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" />
                  </Field>
                </div>
              </div>

              <div>
                <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-s-fg">Who&apos;s playing?</p>
                <p className="mt-1 text-sm text-s-muted">One pass per player. Booking for a friend? Add their name, and their email if they have an account, so it shows up there.</p>
                <ol className="mt-4 grid gap-3">
                  {holders.map((h, i) => (
                    <li key={i} className="rounded-[22px] bg-s-surface ring-1 ring-s-line/[0.08] p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-s-fg">
                          Pass {i + 1} <span className="font-normal text-s-muted">· {h.sport}</span>
                        </span>
                        <div className="ml-auto flex gap-1 rounded-full bg-s-sunken p-1">
                          {[
                            { me: true, label: "Me", Icon: UserLine },
                            { me: false, label: "A friend", Icon: UsersLine },
                          ].map((o) => (
                            <button
                              key={o.label}
                              type="button"
                              onClick={() => setHolder(i, { me: o.me })}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                                h.me === o.me ? "bg-s-invert text-s-invert-fg" : "text-s-muted hover:text-s-fg",
                              )}
                            >
                              <o.Icon className="w-3.5 h-3.5" /> {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {!h.me ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Player's name">
                            <input className={fieldCls} value={h.name} onChange={(e) => setHolder(i, { name: e.target.value })} placeholder="Full name" />
                          </Field>
                          <Field label="Their email (optional)" hint="Links the pass to their account.">
                            <input className={fieldCls} type="email" value={h.email} onChange={(e) => setHolder(i, { email: e.target.value })} placeholder="friend@gmail.com" />
                          </Field>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-s-muted">This one is yours{name ? `, ${name.split(" ")[0]}` : ""}.</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Wallet + bundle */}
              {member ? (
                <div className="rounded-[22px] bg-s-surface ring-1 ring-s-line/[0.08] p-5 grid gap-4">
                  <div className="flex items-center gap-3">
                    <WalletLine className="w-5 h-5 text-s-fg" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-s-fg">Your pass wallet</p>
                      <p className="text-xs text-s-muted">
                        {member.wallet} pass{member.wallet === 1 ? "" : "es"} left
                      </p>
                    </div>
                    {member.wallet > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-s-muted">Use</span>
                        <Stepper value={useWallet} onChange={setUseWallet} max={Math.min(member.wallet, count)} />
                      </div>
                    ) : null}
                  </div>
                  {remaining > 0 ? (
                    <label className="flex items-start gap-3 rounded-[16px] bg-s-sunken px-4 py-3 cursor-pointer">
                      <input type="checkbox" checked={bundle} onChange={(e) => setBundle(e.target.checked)} className="mt-1 w-4 h-4 accent-current" />
                      <span className="text-sm text-s-fg">
                        <span className="font-semibold">
                          Buy a {prices.bundle_size}-pass bundle for {formatPHP(prices.bundle_price)}
                        </span>
                        <span className="block text-xs text-s-muted">
                          {bundle
                            ? `Covers ${t.fromBundle} pass${t.fromBundle === 1 ? "" : "es"} here${t.leftover ? `, ${t.leftover} go to your wallet for next time` : ""}.`
                            : `Save ${formatPHP(bundleSaves)} over ${prices.bundle_size} single passes. Unused passes stay in your wallet, no expiry.`}
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[22px] bg-s-sunken px-5 py-4 text-sm text-s-fg">
                  <span className="font-semibold">Play often?</span> Get {prices.bundle_size} passes for {formatPHP(prices.bundle_price)} with a NotJust account.{" "}
                  <Link href={`/account/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} className="font-semibold underline underline-offset-4">
                    Sign in
                  </Link>
                </div>
              )}

              {error ? <FormError>{error}</FormError> : null}
              <div>
                <Btn type="submit" arrow>
                  {t.total === 0 ? "Confirm booking" : "Continue to payment"}
                </Btn>
              </div>
            </form>
          ) : (
            <div className="grid gap-5">
              <PayPanels total={t.total} file={file} onFile={setFile} />
              {error ? <FormError>{error}</FormError> : null}
              <Btn onClick={() => (file ? send(file) : setError("Upload a screenshot of your payment."))} disabled={!file || submitting} arrow={!!file} className={file ? "w-full justify-between" : "w-full"}>
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
                  <span className="tabular-nums">{formatPHP(l.qty * prices.pass_price)}</span>
                </li>
              ))}
              {useWallet ? (
                <li className="flex justify-between text-s-muted">
                  <span>{useWallet} from your wallet</span>
                  <span className="tabular-nums">-{formatPHP(useWallet * prices.pass_price)}</span>
                </li>
              ) : null}
              {bundle ? (
                <>
                  <li className="flex justify-between text-s-fg">
                    <span>{prices.bundle_size}-pass bundle</span>
                    <span className="tabular-nums">{formatPHP(prices.bundle_price)}</span>
                  </li>
                  <li className="flex justify-between text-s-muted">
                    <span>{t.fromBundle} from the bundle</span>
                    <span className="tabular-nums">-{formatPHP(t.fromBundle * prices.pass_price)}</span>
                  </li>
                </>
              ) : null}
              {paddles ? (
                <li className="flex justify-between text-s-fg">
                  <span>{paddles} × Paddle rental</span>
                  <span className="tabular-nums">{formatPHP(paddles * paddlePrice)}</span>
                </li>
              ) : null}
            </ul>
            <div className="mt-4 flex justify-between border-t border-s-line/[0.08] pt-4 text-base font-semibold text-s-fg">
              <span>Total</span>
              <span className="tabular-nums">{formatPHP(t.total)}</span>
            </div>
            {bundle && t.total > noBundleTotal ? (
              <p className="mt-2 text-xs text-s-muted">Costs a little more today, and you keep {t.leftover} pass{t.leftover === 1 ? "" : "es"} for later.</p>
            ) : null}
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
