"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { readPager } from "@/lib/record-pager";
import { cn } from "@/lib/utils";

// Prev/Next pager for a detail page. Reads the ordered segment list the list
// page published (see PagerPublisher) and finds the current record's neighbors.
// Renders nothing when there's no remembered list or the current record isn't
// in it (e.g. a deep link or a hard refresh after the tab's store cleared).
export function RecordPager({
  entity,
  current,
  basePath,
  encode = false,
}: {
  entity: string;
  // The segment for THIS record — its id, or code for code-keyed routes.
  current: string;
  // e.g. "/dashboard/orders" — neighbor hrefs are `${basePath}/${segment}`.
  basePath: string;
  // Set true for routes keyed by a string code that may need URL-encoding.
  encode?: boolean;
}) {
  const [segments, setSegments] = React.useState<string[]>([]);
  React.useEffect(() => {
    setSegments(readPager(entity));
  }, [entity]);

  const idx = segments.indexOf(current);
  // Need context and at least 2 records to bother showing the control.
  if (idx === -1 || segments.length < 2) return null;

  const prev = idx > 0 ? segments[idx - 1] : null;
  const next = idx < segments.length - 1 ? segments[idx + 1] : null;
  const href = (seg: string) =>
    `${basePath}/${encode ? encodeURIComponent(seg) : seg}`;

  return (
    <div className="inline-flex items-center gap-1">
      <PagerButton href={prev ? href(prev) : null} label="Previous record">
        <ChevronLeft className="w-4 h-4" />
      </PagerButton>
      <span className="px-1.5 text-xs text-inkSoft tabular-nums whitespace-nowrap">
        {idx + 1} of {segments.length}
      </span>
      <PagerButton href={next ? href(next) : null} label="Next record">
        <ChevronRight className="w-4 h-4" />
      </PagerButton>
    </div>
  );
}

function PagerButton({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center w-8 h-8 rounded-md border transition";
  if (!href) {
    return (
      <span
        aria-disabled
        aria-label={`${label} (none)`}
        className={cn(base, "border-border text-inkSoft/40 cursor-not-allowed")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(base, "border-border text-ink hover:bg-cream")}
    >
      {children}
    </Link>
  );
}
