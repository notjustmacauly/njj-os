import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "./app-shell";
import type { Role } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Read role from user_roles
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const role = (roleRow?.role as Role | null) ?? null;

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-ink mb-2">No role assigned</h1>
          <p className="text-sm text-inkSoft">
            Your account exists but has no role yet. Ask Mac to grant you access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <AppShell role={role} email={user.email ?? ""}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
