"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatPHP } from "@/lib/utils";
import { ConfirmingOverlay, newIdempotencyKey, PayPanels, submitWithProof } from "../_components/pay-step";
import { MinusLine, PlusLine, TicketLine, WalletLine } from "../_components/icons";
import { Btn, Field, fieldCls, FormError } from "../_components/ui";
import { useMemberPrefill } from "../account/account-client";
import type { PassPrices } from "../events/[slug]/checkout/pass-checkout";

/** Buy pass bundles into the signed-in member's wallet. */
export function BuyBundle({ prices }: { prices: PassPrices }) {
  const router = useRouter();
  const [state, setState] = React.useState<"loading" | "guest" | "member">("loading");
  const [wallet, setWallet] = React.useState(0);
  const [qty, setQty] = React.useState(1);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [step, setStep] = React.useState<"pick" | "pay">("pick");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const idemKey = React.useRef("");
  React.useEffect(() => {
    idemKey.current = newIdempotencyKey();
    const t = setTimeout(() => setState((s) => (s === "loading" ? "guest" : s)), 1500);
    return () => clearTimeout(t);
  }, []);
  useMemberPrefill((m) => {
    setName(m.name);
    setEmail(m.email);
    setPhone(m.phone);
    setWallet(m.wallet);
    setState(m.confirmed ? "member" : "guest");
  });

  const total = qty * prices.bundle_price;

  async function submit() {
    if (submitting) return;
    if (!file) return setError("Upload a screenshot of your payment.");
    setSubmitting(true);
    setError(null);
    try {
      const token = await submitWithProof("/api/events/checkout", { idempotency_key: idemKey.current, name, email, phone, holders: [], bundles: qty }, file);
      router.push(`/shop/order/${token}`);
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message);
    }
  }

  return (
    <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 sm:p-8">
      {submitting ? <ConfirmingOverlay /> : null}
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-s-brand/40">
          <TicketLine className="w-6 h-6 text-s-fg" />
        </span>
        <div>
          <p className="font-display text-3xl font-semibold tracking-[-0.03em] text-s-fg tabular-nums">{formatPHP(prices.bundle_price)}</p>
          <p className="text-sm text-s-muted">
            {prices.bundle_size} passes, save {formatPHP(prices.bundle_size * prices.pass_price - prices.bundle_price)}
          </p>
        </div>
      </div>

      {state === "loading" ? (
        <div className="mt-8 h-24 animate-pulse rounded-[18px] bg-s-sunken motion-reduce:animate-none" />
      ) : state === "guest" ? (
        <div className="mt-8 grid gap-4">
          <p className="text-s-fg">Bundles go into your NotJust account, so sign in (or create one) first.</p>
          <div className="flex flex-wrap gap-3">
            <Btn href={`/account/login?next=${encodeURIComponent("/passes")}`} arrow>
              Sign in
            </Btn>
            <Btn href={`/account/signup?next=${encodeURIComponent("/passes")}`} variant="quiet">
              Create an account
            </Btn>
          </div>
          <p className="text-xs text-s-muted">No account? You can still buy single passes ({formatPHP(prices.pass_price)}) on any event page.</p>
        </div>
      ) : step === "pick" ? (
        <div className="mt-8 grid gap-6">
          <div className="flex items-center gap-3 rounded-[18px] bg-s-sunken px-4 py-3">
            <WalletLine className="w-5 h-5 text-s-fg" />
            <span className="flex-1 text-sm text-s-fg">
              You have <span className="font-semibold">{wallet}</span> pass{wallet === 1 ? "" : "es"} now
            </span>
            <Link href="/account" className="text-sm font-semibold text-s-fg underline underline-offset-4">
              Your account
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-s-fg">Bundles</span>
            <div className="flex items-center gap-1.5">
              {[
                { d: -1, Icon: MinusLine, label: "One less" },
                { d: 1, Icon: PlusLine, label: "One more" },
              ].map(({ d, Icon, label }, i) => (
                <React.Fragment key={label}>
                  {i === 1 ? <span className="w-8 text-center font-semibold tabular-nums text-s-fg">{qty}</span> : null}
                  <button
                    type="button"
                    aria-label={label}
                    disabled={(d < 0 && qty <= 1) || (d > 0 && qty >= 5)}
                    onClick={() => setQty((q) => q + d)}
                    className="w-10 h-10 rounded-full ring-1 ring-s-line/15 flex items-center justify-center text-s-fg transition hover:bg-s-line/[0.05] disabled:opacity-25"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Mobile number">
              <input className={fieldCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
            </Field>
          </div>
          <div className="flex justify-between border-t border-s-line/[0.08] pt-4 text-base font-semibold text-s-fg">
            <span>
              {qty * prices.bundle_size} passes
            </span>
            <span className="tabular-nums">{formatPHP(total)}</span>
          </div>
          {error ? <FormError>{error}</FormError> : null}
          <Btn
            arrow
            className="w-full justify-between"
            onClick={() => {
              if (!name.trim() || !phone.trim()) return setError("Add your name and mobile number.");
              setError(null);
              setStep("pay");
            }}
          >
            Continue to payment
          </Btn>
        </div>
      ) : (
        <div className="mt-8 grid gap-5">
          <button type="button" onClick={() => setStep("pick")} className={cn("w-fit text-sm font-semibold text-s-muted hover:text-s-fg")}>
            Back
          </button>
          <PayPanels total={total} file={file} onFile={setFile} />
          {error ? <FormError>{error}</FormError> : null}
          <Btn onClick={submit} disabled={!file || submitting} arrow={!!file} className={file ? "w-full justify-between" : "w-full"}>
            I&apos;ve paid, add my passes
          </Btn>
        </div>
      )}
    </div>
  );
}
