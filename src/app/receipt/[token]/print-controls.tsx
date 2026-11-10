"use client";

import * as React from "react";
import { Printer } from "lucide-react";

// Auto "Printed:" timestamp — shows the moment the slip was opened to print
// (Manila time). Rendered on the slip itself (print-visible).
export function PrintedAt() {
  const [t, setT] = React.useState("");
  React.useEffect(() => {
    setT(
      new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }, []);
  return <span suppressHydrationWarning>{t || "—"}</span>;
}

// Screen-only print button.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 rounded-md bg-berry px-3 py-1.5 text-sm font-semibold text-white hover:bg-berry/90"
    >
      <Printer className="w-4 h-4" /> Print receipt
    </button>
  );
}
