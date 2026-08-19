import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { buildInvoiceData, renderInvoicePdf } from "@/lib/bill-invoice-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = roleRow?.role as Role | null;
  if (!role || !OWNER_PARTNER_MANAGER.includes(role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const data = await buildInvoiceData(supabase, params.id, origin);
  if (!data) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  try {
    const pdf = await renderInvoicePdf(data);
    const filename = `Invoice-${data.bill.external_id ?? params.id}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to render PDF";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
