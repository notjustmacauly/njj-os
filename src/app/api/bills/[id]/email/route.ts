import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";
import { buildInvoiceData, renderInvoicePdf } from "@/lib/bill-invoice-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  if (roleRow?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can email bills" }, { status: 403 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: "Email is not configured yet (GMAIL_USER / GMAIL_APP_PASSWORD missing)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    cc?: string;
    message?: string;
  };

  const origin = new URL(req.url).origin;
  const data = await buildInvoiceData(supabase, params.id, origin);
  if (!data) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const recipient = (body.to?.trim() || data.partner.email || "").trim();
  if (!recipient) {
    return NextResponse.json(
      { error: "No recipient email. Add an email to the partner, or type one in." },
      { status: 400 },
    );
  }

  try {
    const pdf = await renderInvoicePdf(data);

    const billTo = data.partner.registered_business_name || data.partner.name || "there";
    const dueLine = data.bill.due_date ? ` It is due on ${formatDate(data.bill.due_date)}.` : "";
    const custom = body.message?.trim();
    const intro = custom
      ? custom
      : `Hi ${billTo},\n\nPlease find attached invoice ${data.bill.external_id ?? ""} for ${formatPHP(
          data.bill.total,
        )}.${dueLine}\n\nEach delivery on the invoice links to its full itemised receipt.\n\nThank you,\n${COMPANY.brandName}`;

    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transport.sendMail({
      from: `${COMPANY.brandName} <${gmailUser}>`,
      to: recipient,
      cc: body.cc?.trim() || undefined,
      subject: `Invoice ${data.bill.external_id ?? ""} from ${COMPANY.brandName}`,
      text: intro,
      attachments: [
        {
          filename: `Invoice-${data.bill.external_id ?? params.id}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ ok: true, to: recipient });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
