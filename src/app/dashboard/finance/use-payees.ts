"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { ComboboxOption } from "@/components/ui/combobox";

/**
 * Loads the active payee directory for the picker, and exposes `remember()`
 * to auto-grow the list when a transaction is saved with a new name.
 *
 * The directory is an autocomplete helper only — `remember()` is best-effort
 * and never blocks the transaction it follows.
 */
export function usePayees() {
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("payees")
      .select("name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");
    setOptions(
      (data ?? []).map((r: { name: string }) => ({ value: r.name, label: r.name })),
    );
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Fire-and-forget: remember a typed name so it shows up next time.
  const remember = React.useCallback(async (name: string | null | undefined) => {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return;
    if (options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) return;
    const supabase = createClient();
    await supabase.rpc("upsert_payee", { p_name: trimmed });
  }, [options]);

  return { options, remember, reload: load };
}
