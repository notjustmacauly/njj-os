"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Month input bound to the `month` URL param. Native HTML month input
 * keeps things lean — the browser handles the picker UI per platform.
 */
export function MonthInput({ defaultIso }: { defaultIso: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get("month") ?? defaultIso;

  return (
    <input
      type="month"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("month", e.target.value);
        else next.delete("month");
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }}
      aria-label="Month"
      className="h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/30 focus-visible:border-berry"
    />
  );
}
