import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/ui/toast";
import { Sidebar } from "./sidebar";

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

  const role = roleRow?.role ?? null;

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
      <div className="min-h-screen flex bg-cream">
        <Sidebar role={role} email={user.email ?? ""} />
        <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">{children}</main>
      </div>
    </ToastProvider>
  );
}
