"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, GoogleButton, OrDivider } from "../../_components/auth-shell";
import { MailLine } from "../../_components/icons";
import { Btn, Field, fieldCls, FormError } from "../../_components/ui";

export default function SignupPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim() || !email.trim() || !password) return setError("Fill in your name, email and a password.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("That email address doesn't look right.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    const { error: err } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/account`,
        data: { full_name: name.trim(), phone: phone.trim() },
      },
    });
    setBusy(false);
    if (err) {
      return setError(
        err.message.toLowerCase().includes("signups not allowed")
          ? "Accounts open soon. You can still order and book passes as a guest."
          : err.message,
      );
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email">
        <div className="flex gap-4">
          <MailLine className="w-6 h-6 text-s-fg shrink-0 mt-0.5" />
          <p className="text-s-muted leading-relaxed">
            We sent a link to <span className="font-semibold text-s-fg">{sentTo}</span>. Open it to confirm your email and
            finish setting up your account.
          </p>
        </div>
        <p className="mt-6 text-sm text-s-muted">
          Nothing there? Check spam, or{" "}
          <button type="button" onClick={() => setSentTo(null)} className="font-semibold text-s-fg underline underline-offset-4">
            try a different email
          </button>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create an account"
      lede="Keep your QR passes, orders and deliveries together. Anything you bought with this email shows up too."
    >
      <GoogleButton label="Sign up with Google" />
      <OrDivider />
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <Field label="Full name">
          <input className={fieldCls} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={fieldCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mobile number (optional)">
          <input
            className={fieldCls}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input
            className={fieldCls}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <Btn type="submit" arrow={!busy} disabled={busy} className="w-full justify-between">
          {busy ? "Creating your account" : "Create account"}
        </Btn>
      </form>
      <p className="mt-6 text-sm text-s-muted">
        Already have an account?{" "}
        <Link href="/account/login" className="font-semibold text-s-fg underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
