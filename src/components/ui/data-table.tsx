import * as React from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
};

/**
 * Server-rendered table. Columns carry render functions, so this MUST stay
 * a server component (or live alongside its parent in a single client tree)
 * — passing render functions across the server→client boundary throws at
 * runtime. Interactive bits (filters, search) live in url-filters.tsx.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  className,
  mobileCard,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  className?: string;
  // Optional mobile (sm:) renderer. When provided, the table is hidden on
  // mobile and a stacked card-list is shown instead. Without it, the table
  // simply scrolls horizontally inside its card (set by overflow-x-auto).
  mobileCard?: (row: T) => React.ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "bg-white border border-border rounded-lg shadow-card overflow-x-auto",
          mobileCard ? "hidden md:block" : undefined,
          className,
        )}
      >
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-smallcaps",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-cream/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 text-ink", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobileCard ? (
        <div className="md:hidden space-y-2">
          {rows.map((row) => (
            <React.Fragment key={rowKey(row)}>{mobileCard(row)}</React.Fragment>
          ))}
        </div>
      ) : null}
    </>
  );
}
