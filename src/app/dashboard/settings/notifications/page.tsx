import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { NotificationsSettings } from "./notifications-settings";

export default async function SettingsNotificationsPage() {
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
  if (!role) redirect("/dashboard");

  // Current prefs — absence of a row means "all on".
  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("email_enabled, push_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <NotificationsSettings
      initialEmailEnabled={prefs?.email_enabled ?? true}
      initialPushEnabled={prefs?.push_enabled ?? true}
    />
  );
}
