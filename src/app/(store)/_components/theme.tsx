"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Storefront appearance: "auto" follows the device, "light"/"dark" pin it.
// The choice lives in localStorage (per visitor) and is applied as
// <html data-theme="…">, which the .store tokens in globals.css read.

export type ThemePref = "auto" | "light" | "dark";
const KEY = "njj-theme";

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/** Runs before first paint so a pinned theme never flashes the wrong colours. */
export function ThemeScript() {
  const code = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

const OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Three-way appearance control (Auto / Light / Dark). */
export function ThemeSwitch({ className }: { className?: string }) {
  const [pref, setPref] = React.useState<ThemePref>("auto");

  React.useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setPref(t);
    } catch {
      // storage blocked: stay on auto
    }
  }, []);

  function choose(next: ThemePref) {
    setPref(next);
    apply(next);
    try {
      if (next === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: the choice still applies for this visit
    }
  }

  return (
    <div role="radiogroup" aria-label="Appearance" className={cn("inline-flex rounded-full bg-s-sunken p-1", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => choose(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-semibold transition duration-300 ease-settle active:scale-[0.97]",
            pref === o.value ? "bg-s-surface text-s-fg shadow-float" : "text-s-muted hover:text-s-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
