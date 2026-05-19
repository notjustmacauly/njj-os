import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/roles";

export type AccountOption = { code: string; name: string };

/**
 * Filter an account list to the ones the current user is allowed to act on,
 * mirroring the server-side `user_can_use_account` helper:
 *
 *  - Owner is exempt (always sees every account).
 *  - Non-owner with `team_members.allowed_account_codes IS NULL`: unrestricted.
 *  - Non-owner with a non-null list: only the listed codes.
 *
 * Pass any subset of `accounts` (typically just active accounts already
 * pre-filtered server-side). Returns a stable-ordered subset.
 */
export async function filterAllowedAccounts(
  supabase: SupabaseClient,
  role: Role | null,
  userId: string,
  accounts: AccountOption[],
): Promise<AccountOption[]> {
  if (role === "owner") return accounts;
  const { data } = await supabase
    .from("team_members")
    .select("allowed_account_codes")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  const allowed = (data?.allowed_account_codes ?? null) as string[] | null;
  if (allowed === null) return accounts;
  return accounts.filter((a) => allowed.includes(a.code));
}
