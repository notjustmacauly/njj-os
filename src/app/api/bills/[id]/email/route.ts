import * as React from "react";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";
import type { InvoiceData } from "@/lib/bill-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRel = {
  external_id: string | null;
  order_date: string | null;
  delivery_date: string | null;
  public_token: string | null;
};

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

  const [{ data: bill }, { data: linked }] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id, external_id, bill_date, due_date, payment_terms, status, subtotal, delivery_fees, discount, total, partner:partners(name, registered_business_name, tin, address, email)",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("bill_receivables")
      .select(
        "receivable:receivables(external_id, amount, order:orders(external_id, order_date, delivery_date, public_token))",
      )
      .eq("bill_id", params.id),
  ]);

  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const partner = (Array.isArray(bill.partner) ? bill.partner[0] : bill.partner) as
    | { name: string; registered_business_name: string | null; tin: string | null; address: string | null; email: string | null }
    | null;

  const recipient = (body.to?.trim() || partner?.email || "").trim();
  if (!recipient) {
    return NextResponse.json(
      { error: "No recipient email. Add an email to the partner, or type one in." },
      { status: 400 },
    );
  }

  const lines = ((linked ?? []) as unknown as Array<{
    receivable:
      | { external_id: string | null; amount: number | string; order: OrderRel | OrderRel[] | null }
      | { external_id: string | null; amount: number | string; order: OrderRel | OrderRel[] | null }[]
      | null;
  }>).flatMap((row) => {
    const recv = Array.isArray(row.receivable) ? row.receivable[0] : row.receivable;
    if (!recv) return [];
    const order = Array.isArray(recv.order) ? recv.order[0] : recv.order;
    return [
      {
        order_external_id: order?.external_id ?? null,
        receivable_external_id: recv.external_id,
        order_date: order?.order_date ?? null,
        delivery_date: order?.delivery_date ?? null,
        amount: Number(recv.amount ?? 0),
        public_token: order?.public_token ?? null,
      },
    ];
  });

  const origin = new URL(req.url).origin;
  const data: InvoiceData = {
    origin,
    bill: {
      external_id: bill.external_id,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      payment_terms: bill.payment_terms,
      status: bill.status,
      subtotal: Number(bill.subtotal ?? 0),
      delivery_fees: Number(bill.delivery_fees ?? 0),
      discount: Number(bill.discount ?? 0),
      total: Number(bill.total ?? 0),
    },
    partner: {
      name: partner?.name ?? null,
      registered_business_name: partner?.registered_business_name ?? null,
      tin: partner?.tin ?? null,
      address: partner?.address ?? null,
      email: partner?.email ?? null,
    },
    lines,
  };

  try {
    // Render the PDF (dynamic import keeps react-pdf out of the edge bundle).
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { BillInvoicePdf } = await import("@/lib/bill-invoice-pdf");
    // BillInvoicePdf renders a <Document> at its root; the react-pdf types
    // insist the top-level element be typed as Document, so cast past the check.
    const pdfElement = React.createElement(BillInvoicePdf, { data }) as unknown as Parameters<
      typeof renderToBuffer
    >[0];
    const pdf = await renderToBuffer(pdfElement);

    const billTo = partner?.registered_business_name || partner?.name || "there";
    const dueLine = bill.due_date ? ` It is due on ${formatDate(bill.due_date)}.` : "";
    const custom = body.message?.trim();
    const intro = custom
      ? custom
      : `Hi ${billTo},\n\nPlease find attached invoice ${bill.external_id ?? ""} for ${formatPHP(
          Number(bill.total ?? 0),
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
      subject: `Invoice ${bill.external_id ?? ""} from ${COMPANY.brandName}`,
      text: intro,
      attachments: [
        {
          filename: `Invoice-${bill.external_id ?? params.id}.pdf`,
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
