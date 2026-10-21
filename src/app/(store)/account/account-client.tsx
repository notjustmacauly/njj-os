"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckLine } from "../_components/icons";
import { Btn, Field, fieldCls, FormError } from "../_components/ui";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(fullName);
  const [mobile, setMobile] = React.useState(phone);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: err } = await createClient().rpc("member_save_profile", { p_full_name: name, p_phone: mobile });
    setBusy(false);
    if (err) return setError(err.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-5 grid gap-4" noValidate>
      <Field label="Full name">
        <input className={fieldCls} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Mobile number">
        <input
          className={fieldCls}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
        />
      </Field>
      {error ? <FormError>{error}</FormError> : null}
      <div className="flex items-center gap-3">
        <Btn type="submit" disabled={busy}>
          {busy ? "Saving" : "Save"}
        </Btn>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-s-fg">
            <CheckLine className="w-4 h-4" /> Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  async function out() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button type="button" onClick={out} className="text-sm font-semibold text-s-muted underline underline-offset-4 hover:text-s-fg">
      Sign out
    </button>
  );
}

/** Prefill checkout fields from the signed-in customer's profile (no-op for guests). */
export type MemberPrefill = { name: string; email: string; phone: string; wallet: number; confirmed: boolean };
export function useMemberPrefill(apply: (p: MemberPrefill) => void) {
  const applied = React.useRef(false);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.rpc("member_me");
      if (!alive || !data || applied.current) return;
      applied.current = true;
      const me = data as { email: string; full_name: string | null; phone: string | null; wallet?: number; email_confirmed?: boolean };
      apply({ name: me.full_name ?? "", email: me.email ?? "", phone: me.phone ?? "", wallet: Number(me.wallet ?? 0), confirmed: !!me.email_confirmed });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
