"use client";

import * as React from "react";
import { BUILD_ID } from "@/lib/build-id";

const POLL_MS = 60_000;
const RELOAD_KEY = "njjos_reloaded_for";

/**
 * Detects when a newer build is live and refreshes the app so nobody gets
 * stuck on a stale version. Polls a no-cache endpoint (and on focus/visibility);
 * when the live id differs from this bundle's baked id it auto-reloads — but
 * waits if the user is typing, and shows a banner as a manual fallback. A
 * per-id session guard prevents any reload loop.
 */
export function VersionWatcher() {
  const [newId, setNewId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { id?: string };
        if (!cancelled && data?.id && data.id !== BUILD_ID) setNewId(data.id);
      } catch {
        /* offline / transient — ignore */
      }
    }
    check();
    const iv = setInterval(check, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  React.useEffect(() => {
    if (!newId) return;
    // Loop guard: if we already reloaded for this id and it's still stale
    // (shouldn't happen), don't reload again — just show the banner.
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === newId) return;
    } catch { /* sessionStorage blocked — fall through to banner only */ }

    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const reload = () => {
      try { sessionStorage.setItem(RELOAD_KEY, newId); } catch { /* ignore */ }
      window.location.reload();
    };
    if (!isEditing()) { reload(); return; }
    const onOut = () => setTimeout(() => { if (!isEditing()) reload(); }, 500);
    document.addEventListener("focusout", onOut);
    return () => document.removeEventListener("focusout", onOut);
  }, [newId]);

  if (!newId) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-berry text-white text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-card">
      <span>A new version of NJJ OS is available.</span>
      <button onClick={() => window.location.reload()} className="rounded-md bg-white/20 hover:bg-white/30 px-3 py-1 font-semibold transition">
        Update now
      </button>
    </div>
  );
}
