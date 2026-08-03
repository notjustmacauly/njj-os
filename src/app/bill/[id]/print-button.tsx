"use client";

import { Printer } from "lucide-react";

// "Download PDF" = the browser's native Print → Save as PDF. Chrome preserves
// the <a> links in the invoice as clickable annotations in the saved PDF.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 bg-berry text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-card hover:bg-berry/90 transition"
    >
      <Printer className="w-4 h-4" />
      Download / print PDF
    </button>
  );
}
