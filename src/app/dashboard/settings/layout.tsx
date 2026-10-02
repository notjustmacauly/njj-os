import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { SettingsSubNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
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
  // Per-page gates own the access rules; the layout only draws the tabs.

  return (
    <div className="space-y-6">
      {role ? <SettingsSubNav role={role} /> : null}
      {children}
    </div>
  );
}
