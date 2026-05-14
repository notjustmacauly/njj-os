import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PartnerForm, type PartnerTier } from "../partner-form";

export default async function NewPartnerPage() {
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
  const role = roleRow?.role as import("@/lib/roles").Role | null;
  // Per matrix: owner/partner/manager can create partners.
  const canEdit = role === "owner" || role === "partner" || role === "manager";

  if (!canEdit) {
    redirect("/dashboard/partners");
  }

  const { data: tiersData } = await supabase
    .from("partner_tiers")
    .select("code, name, price_pcl, price_acg, price_wpm")
    .eq("is_active", true)
    .order("code");
  const tiers = (tiersData ?? []) as PartnerTier[];

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/partners"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to partners
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">📋</span>
          New Partner
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          The external ID (B2B-XXX) is assigned automatically when you save.
        </p>
      </header>

      <div className="bg-white border border-border rounded-lg shadow-card p-6">
        <PartnerForm tiers={tiers} canEdit={canEdit} />
      </div>
    </div>
  );
}
