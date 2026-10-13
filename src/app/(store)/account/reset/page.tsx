"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "../../_components/auth-shell";
import { Btn, Field, fieldCls, FormError } from "../../_components/ui";

/** Reached from the reset email (the callback has already signed them in). */
export default function ResetPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Those passwords don't match.");
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      return setError(
        err.message.toLowerCase().includes("session") ? "This reset link has expired. Request a new one." : err.message,
      );
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <Field label="New password" hint="At least 8 characters.">
          <input className={fieldCls} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input className={fieldCls} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <Btn type="submit" arrow={!busy} disabled={busy} className="w-full justify-between">
          {busy ? "Saving" : "Save password"}
        </Btn>
      </form>
    </AuthShell>
  );
}
