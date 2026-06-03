// Lightweight "remember what list I was looking at" store for Prev/Next
// navigation on detail pages. A list page publishes the ordered segment values
// (record ids, or codes for code-keyed routes) of the rows it's currently
// showing — already filtered + sorted — into sessionStorage. The matching
// detail page reads that sequence to find the current record's neighbors.
//
// sessionStorage (not localStorage) so it's scoped to the tab and clears when
// the tab closes — exactly the lifetime of "the list I just came from".

const PREFIX = "njj:pager:";

function key(entity: string): string {
  return `${PREFIX}${entity}`;
}

export function publishPager(entity: string, segments: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key(entity), JSON.stringify(segments));
  } catch {
    // Private mode / quota / disabled storage — pager just won't show. Fine.
  }
}

export function readPager(entity: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(key(entity));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
