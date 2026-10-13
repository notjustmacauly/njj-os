"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Container } from "./ui";

/** Centred card layout shared by sign-in, sign-up and password pages. */
export function AuthShell({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <Container className="pt-14 md:pt-20">
      <div className="mx-auto max-w-md">
        <h1 className="font-display font-semibold tracking-[-0.04em] leading-[1] text-5xl text-s-fg">{title}</h1>
        {lede ? <p className="mt-4 text-s-muted leading-relaxed">{lede}</p> : null}
        <div className="mt-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 sm:p-7">{children}</div>
      </div>
    </Container>
  );
}

/** "Continue with Google" (Supabase OAuth). Lands back on /account. */
export function GoogleButton({ label = "Continue with Google", next = "/account" }: { label?: string; next?: string }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setBusy(false);
      setError(err.message.includes("provider is not enabled") ? "Google sign-in isn't switched on yet. Use email for now." : err.message);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={cn(
          "w-full inline-flex items-center justify-center gap-3 rounded-full bg-s-surface ring-1 ring-s-line/15 px-6 py-3.5 font-semibold text-s-fg transition duration-300 ease-settle hover:ring-s-line/40 active:scale-[0.98]",
          busy && "opacity-60",
        )}
      >
        {/* Brand mark from Simple Icons (official Google "G"). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://cdn.simpleicons.org/google/4285F4" alt="" width={18} height={18} />
        {label}
      </button>
      {error ? <p role="alert" className="mt-2 text-sm font-semibold text-s-danger">{error}</p> : null}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-s-muted" aria-hidden>
      <span className="h-px flex-1 bg-s-line/10" />
      or
      <span className="h-px flex-1 bg-s-line/10" />
    </div>
  );
}
