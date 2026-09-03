"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // The callback (or the link's own token) establishes a session; confirm it.
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (err) return setError(err.message);
    router.push("/dashboard");
    router.refresh();
  }

  if (hasSession === false) {
    return (
      <p className="text-sm text-inkSoft">
        This link has expired or was already used. Go to the{" "}
        <a href="/login" className="text-berry underline">
          login page
        </a>{" "}
        and use &ldquo;Forgot password&rdquo; to get a fresh link.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="np" className="block text-sm font-medium text-ink mb-1">New password</label>
        <input
          id="np"
          type="password"
          required
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
        />
      </div>
      <div>
        <label htmlFor="np2" className="block text-sm font-medium text-ink mb-1">Confirm password</label>
        <input
          id="np2"
          type="password"
          required
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
        />
      </div>
      {error && (
        <div className="text-sm text-coral bg-coral/10 border border-coral/30 rounded-md px-3 py-2">{error}</div>
      )}
      <button
        type="submit"
        disabled={saving || hasSession === null}
        className="w-full rounded-md bg-berry text-white text-sm font-semibold py-2.5 hover:bg-berry/90 disabled:opacity-50 transition"
      >
        {saving ? "Saving…" : "Set password & continue"}
      </button>
    </form>
  );
}
