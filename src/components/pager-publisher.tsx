"use client";

import * as React from "react";
import { publishPager } from "@/lib/record-pager";

// Drop-in (renders nothing) that publishes the currently-displayed, ordered
// list of record segments so detail pages can offer Prev/Next. Safe to render
// from a server component — it's a client island.
//
// Pass the segment values in the SAME order the rows appear on screen, after
// any filtering/sorting, so Prev/Next walks exactly what the user saw.
export function PagerPublisher({
  entity,
  segments,
}: {
  entity: string;
  segments: string[];
}) {
  const signature = segments.join(",");
  React.useEffect(() => {
    publishPager(entity, segments);
    // signature captures both order and membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, signature]);
  return null;
}
