import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

type ItemRow = {
  id: string; name: string; user_id: string | null; person_id: string | null;
  share_token: string; net_amount: number | string;
  payroll_runs: { label: string; period_start: string; period_end: string; pay_date: string; status: string }
    | { label: string; period_start: string; period_end: string; pay_date: string; status: string }[];
};

// Owner-only: email one payslip to the employee's dedicated payslip email.
// Sends from the owner's Gmail via an App Password (GMAIL_USER / GMAIL_APP_PASSWORD).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  if (roleRow?.role !== "owner") return NextResponse.json({ error: "Only the owner can email payslips." }, { status: 403 });

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email isn't set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in Netlify." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  const itemId = (body.itemId ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "Missing item." }, { status: 400 });

  const { data: itemRaw } = await supabase
    .from("payroll_items")
    .select("id, name, user_id, person_id, share_token, net_amount, payroll_runs!inner(label, period_start, period_end, pay_date, status)")
    .eq("id", itemId)
    .single();
  const item = itemRaw as ItemRow | null;
  if (!item) return NextResponse.json({ error: "Payslip line not found." }, { status: 404 });
  const run = Array.isArray(item.payroll_runs) ? item.payroll_runs[0] : item.payroll_runs;
  if (!run || run.status !== "approved") {
    return NextResponse.json({ error: "Approve the run before emailing payslips." }, { status: 400 });
  }

  // Recipient = the dedicated payslip email on the person's profile (never the
  // shared login email).
  let recipient: string | null = null;
  if (item.user_id) {
    const { data } = await supabase.from("team_members").select("payslip_email").eq("user_id", item.user_id).maybeSingle();
    recipient = (data?.payslip_email as string | null) ?? null;
  } else if (item.person_id) {
    const { data } = await supabase.from("payroll_people").select("email").eq("id", item.person_id).maybeSingle();
    recipient = (data?.email as string | null) ?? null;
  }
  if (!recipient || !recipient.includes("@")) {
    return NextResponse.json({ error: `No payslip email set for ${item.name}. Add one on their profile.` }, { status: 400 });
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "njj-os.netlify.app";
  const link = `${proto}://${host}/payslip/${item.share_token}`;
  const net = peso.format(Number(item.net_amount ?? 0));
  const period = `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2b2b2b">
    <div style="background:#f7a9a0;border-radius:12px 12px 0 0;padding:20px;text-align:center">
      <div style="font-weight:800;font-size:20px;color:#5b1e17">${COMPANY.brandName}</div>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="margin:0 0 12px">Hi ${item.name},</p>
      <p style="margin:0 0 12px">Your payslip for <b>${period}</b> (pay date ${fmtDate(run.pay_date)}) is ready.</p>
      <p style="margin:0 0 20px">Net pay: <b>${net}</b></p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="background:#7a1f2b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;display:inline-block">View &amp; download payslip</a>
      </p>
      <p style="margin:0;color:#888;font-size:12px">Or open this link: <br><a href="${link}" style="color:#7a1f2b">${link}</a></p>
      <p style="margin:20px 0 0;color:#888;font-size:12px">If you have any questions, just reply to this email.</p>
    </div>
  </div>`;

  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transport.sendMail({
      from: `"${COMPANY.brandName}" <${gmailUser}>`,
      to: recipient,
      subject: `Your payslip — ${period}`,
      html,
      text: `Hi ${item.name}, your payslip for ${period} (pay date ${fmtDate(run.pay_date)}) is ready. Net pay: ${net}. View it here: ${link}`,
    });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't send: ${(e as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: recipient });
}
