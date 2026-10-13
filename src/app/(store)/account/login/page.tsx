"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, GoogleButton, OrDivider } from "../../_components/auth-shell";
import { Btn, Field, fieldCls, FormError } from "../../_components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(params.get("error"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setBusy(false);
      return setError(
        err.message.toLowerCase().includes("not confirmed")
          ? "Confirm your email first. Check your inbox for the link we sent."
          : err.message.toLowerCase().includes("invalid")
            ? "That email and password don't match."
            : err.message,
      );
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <AuthShell title="Sign in" lede="See your passes, orders and deliveries in one place.">
      <GoogleButton />
      <OrDivider />
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <Field label="Email">
          <input className={fieldCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            className={fieldCls}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <Btn type="submit" arrow={!busy} disabled={busy} className="w-full justify-between">
          {busy ? "Signing in" : "Sign in"}
        </Btn>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/account/forgot" className="text-s-muted underline underline-offset-4 hover:text-s-fg">
          Forgot password?
        </Link>
        <Link href="/account/signup" className="font-semibold text-s-fg underline underline-offset-4">
          Create an account
        </Link>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
