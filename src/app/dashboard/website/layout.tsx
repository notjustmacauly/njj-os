import { redirect } from "next/navigation";
import { ExternalLink, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasRole, OWNER_PARTNER, type Role } from "@/lib/roles";
import { WebsiteSubNav } from "./website-nav";

export default async function WebsiteLayout({ children }: { children: React.ReactNode }) {
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
  // Website admin: owner + partner (matches the sidebar button).
  if (!hasRole(role, OWNER_PARTNER)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
            <Globe className="w-7 h-7 text-berry" />
            Website
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Set up and control what the public NotJust site shows.
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-berry hover:underline"
        >
          View live site
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </header>
      <WebsiteSubNav />
      {children}
    </div>
  );
}
