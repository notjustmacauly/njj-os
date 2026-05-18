import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PartnerForm, type PartnerRecord, type PartnerTier } from "../partner-form";
import { PartnerHeader } from "../partner-header";

export default async function PartnerDetailPage({
  params,
}: {
  params: { id: string };
}) {
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
  // Per access matrix: owner/partner/manager can edit partner records.
  const canEdit = role === "owner" || role === "partner" || role === "manager";

  const [{ data: partnerData }, { data: tiersData }] = await Promise.all([
    supabase
      .from("partners")
      .select(
        "id, external_id, name, city, tier_code, delivery_fee, contact, email, address, registered_business_name, tin, price_pcl, price_acg, price_wpm, notes, is_active, deleted_at",
      )
      .eq("id", params.id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("partner_tiers")
      .select("code, name, price_pcl, price_acg, price_wpm")
      .eq("is_active", true)
      .order("code"),
  ]);

  if (!partnerData) notFound();

  const partner = partnerData as PartnerRecord & { is_active: boolean };
  const tiers = (tiersData ?? []) as PartnerTier[];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/partners"
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to partners
      </Link>

      <PartnerHeader
        partnerId={partner.id}
        externalId={partner.external_id}
        name={partner.name}
        tierCode={partner.tier_code}
        deliveryFee={partner.delivery_fee}
        isActive={partner.is_active}
        canManage={canEdit}
      />

      <div className="bg-white border border-border rounded-lg shadow-card p-6">
        <h2 className="font-serif font-bold text-xl text-ink mb-4">
          {canEdit ? "Edit details" : "Partner details"}
        </h2>
        <PartnerForm tiers={tiers} partner={partner} canEdit={canEdit} />
      </div>
    </div>
  );
}
