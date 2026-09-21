"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

// Dashboard error boundary. A very common cause after a deploy is a stale code
// chunk (the open tab references an old build's JS that no longer exists) —
// those we auto-recover by reloading once. Anything else shows a friendly
// retry instead of the raw "Application error" screen.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const msg = String(error?.message || "");
  const isChunk =
    error?.name === "ChunkLoadError" ||
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|import\(\)/i.test(msg);

  React.useEffect(() => {
    if (!isChunk) return;
    try {
      const key = "njjos_chunk_reloaded_at";
      const last = Number(sessionStorage.getItem(key) || 0);
      // Reload at most once per 20s to recover, without risking a loop.
      if (Date.now() - last > 20_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [isChunk]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <p className="text-lg font-semibold text-ink">
          {isChunk ? "Updating to the latest version…" : "Something went wrong"}
        </p>
        <p className="text-sm text-inkSoft mt-1">
          {isChunk
            ? "A new version is live — refreshing now. If this doesn't clear, tap Reload."
            : "Please try again. If it keeps happening, reload the page."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="ghost" onClick={() => reset()}>Try again</Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    </div>
  );
}
