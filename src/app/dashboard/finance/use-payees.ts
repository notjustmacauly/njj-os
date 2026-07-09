"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { ComboboxOption } from "@/components/ui/combobox";

export type PayeeDetails = {
  name: string;
  contact_number: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
};

/**
 * Loads the active payee directory for the picker, and exposes `remember()`
 * to auto-grow the list when a transaction is saved with a new name.
 *
 * The directory is an autocomplete helper only — `remember()` is best-effort
 * and never blocks the transaction it follows. `details` lets a form show a
 * picked payee's saved contact/payment info; look up by lower-cased name.
 */
export function usePayees() {
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [details, setDetails] = React.useState<Record<string, PayeeDetails>>({});

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("payees")
      .select("name, contact_number, bank_name, account_number, account_name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");
    const rows = (data ?? []) as PayeeDetails[];
    setOptions(rows.map((r) => ({ value: r.name, label: r.name })));
    setDetails(Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), r])));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Fire-and-forget: remember a typed name so it shows up next time.
  const remember = React.useCallback(
    async (name: string | null | undefined) => {
      const trimmed = (name ?? "").trim();
      if (!trimmed) return;
      if (options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) return;
      const supabase = createClient();
      await supabase.rpc("upsert_payee", { p_name: trimmed });
    },
    [options],
  );

  return { options, details, remember, reload: load };
}
