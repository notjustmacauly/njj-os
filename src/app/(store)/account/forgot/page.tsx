"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "../../_components/auth-shell";
import { Btn, Field, fieldCls, FormError } from "../../_components/ui";

export default function ForgotPage() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Enter the email you signed up with.");
    setBusy(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/reset`,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setSent(true);
  }

  return (
    <AuthShell title="Reset your password" lede={sent ? undefined : "We'll email you a link to set a new one."}>
      {sent ? (
        <p className="text-s-muted leading-relaxed">
          If <span className="font-semibold text-s-fg">{email.trim()}</span> has an account, a reset link is on its way.
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <Field label="Email">
            <input className={fieldCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error ? <FormError>{error}</FormError> : null}
          <Btn type="submit" arrow={!busy} disabled={busy} className="w-full justify-between">
            {busy ? "Sending" : "Send reset link"}
          </Btn>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link href="/account/login" className="text-s-muted underline underline-offset-4 hover:text-s-fg">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
