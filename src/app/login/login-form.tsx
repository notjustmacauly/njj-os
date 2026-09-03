"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/set-password`,
      });
      setLoading(false);
      if (error) return setError(error.message);
      setInfo("Check your email for a link to set your password.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
          placeholder="you@notjust.com"
        />
      </div>

      {mode === "signin" ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <button
              type="button"
              onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
              className="text-xs text-berry hover:underline"
            >
              Forgot / set password
            </button>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
          />
        </div>
      ) : (
        <p className="text-xs text-inkSoft">
          New here or invited? Enter your email and we&rsquo;ll send a link to set your password.{" "}
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
            className="text-berry hover:underline"
          >
            Back to sign in
          </button>
        </p>
      )}

      {error && (
        <div className="text-sm text-coral bg-coral/10 border border-coral/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-green bg-greenBg border border-green/30 rounded-md px-3 py-2">
          {info}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-berry text-white text-sm font-semibold py-2.5 hover:bg-berry/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? "Please wait…" : mode === "reset" ? "Send set-password link" : "Sign in"}
      </button>
    </form>
  );
}
