// Map a ledger_entries (ref_type, ref_id, account_code) to a destination URL.
// Used by the overview activity feed and the revenue page row-click handlers.

export function refLinkFor({
  ref_type,
  ref_id,
  account_code,
}: {
  ref_type: string | null;
  ref_id: string | null;
  account_code: string;
}): string {
  if (ref_id) {
    switch (ref_type) {
      case "pos_shift":
        return `/dashboard/pos/sessions/${ref_id}`;
      case "order":
        return `/dashboard/orders/${ref_id}`;
      case "payment":
      case "transfer":
        return `/dashboard/finance/payments/${ref_id}`;
      case "bill":
        return `/dashboard/finance/bills/${ref_id}`;
      case "expense":
        return `/dashboard/finance/expenses?highlight=${ref_id}`;
      case "revenue":
      case "revenue_void":
        return `/dashboard/finance/revenue`;
      default:
        break;
    }
  }
  return `/dashboard/finance/accounts/${encodeURIComponent(account_code)}`;
}

// Human-readable source label for the Revenue page "Source" column.
export function sourceLabelFor(ref_type: string | null): string {
  switch (ref_type) {
    case "pos_shift":
      return "POS";
    case "order":
      return "Order";
    case "bill":
      return "Bill";
    case "ticket_sale":
      return "Ticket";
    case "revenue":
      return "Standalone";
    case "revenue_void":
      return "Void";
    case "manual_in":
    case "manual":
      return "Manual";
    case "payment":
      return "Payment";
    case "transfer":
      return "Transfer";
    case "reversal":
      return "Reversal";
    default:
      return ref_type || "—";
  }
}

// Source-type group keys used by the Revenue page filter pill set.
export const REVENUE_SOURCES: { key: string; label: string; refTypes: string[] }[] = [
  { key: "pos", label: "POS", refTypes: ["pos_shift"] },
  { key: "orders", label: "Orders", refTypes: ["order"] },
  { key: "bills", label: "Bills", refTypes: ["bill"] },
  { key: "tickets", label: "Tickets", refTypes: ["ticket_sale"] },
  { key: "standalone", label: "Standalone", refTypes: ["revenue"] },
  { key: "manual", label: "Manual", refTypes: ["manual_in", "manual"] },
];
