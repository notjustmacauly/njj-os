import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole, OWNER_ONLY, type Role } from "@/lib/roles";
import { TelegramAccessManager, type AllowedUser } from "./telegram-access-manager";

export const dynamic = "force-dynamic";

export default async function TelegramAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = (roleRow?.role as Role | null) ?? null;
  if (!hasRole(role, OWNER_ONLY)) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("telegram_allowed_users")
    .select("telegram_user_id, display_name, is_active, created_at")
    .order("created_at", { ascending: true });

  return <TelegramAccessManager initial={(rows ?? []) as AllowedUser[]} />;
}
