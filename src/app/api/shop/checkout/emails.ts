import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";

export type ShopItem = { name: string; cans: number; deliveries: number; price: number; mix: Record<string, number> };
export type PassItem = { kind: "pass" | "paddle"; name: string; qty: number; price: number; sport_id?: string };

export type CheckoutReceipt = {
  kind: "shop" | "passes";
  reference: string;
  name: string;
  email: string;
  address: string | null;
  items: Array<ShopItem & PassItem>;
  subtotal: number;
  delivery_total: number;
  total: number;
  status: string;
  deliveries: Array<{ date: string; reference: string; pcl: number; acg: number; wpm: number; status: string }>;
  event: {
    name: string;
    slug: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    venue: string | null;
    maps_url: string | null;
    image: string | null;
  } | null;
  passes: Array<{ code: string; sport: string; token: string; checked_in: boolean }>;
};

export function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

const FLAVOR: Record<string, string> = { PCL: "Pineapple", ACG: "Apple", WPM: "Watermelon" };

function site(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL ?? "https://njj-os.netlify.app").replace(/\/$/, "");
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function mixText(mix: Record<string, number>): string {
  return Object.entries(mix)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n}× ${FLAVOR[c] ?? c}`)
    .join(", ");
}

/**
 * Customer confirmation + a heads-up to the team. Throws on failure so the
 * caller can record it. `teamCopy: false` skips the team email (resends).
 */
export async function sendCheckoutEmails(
  supabase: SupabaseClient,
  token: string,
  { teamCopy = true }: { teamCopy?: boolean } = {},
) {
  const user = process.env.GMAIL_USER ?? process.env.GMAIL_USER_MAC;
  const pass = process.env.GMAIL_APP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD_MAC;
  if (!user || !pass) throw new Error("Email isn't configured (GMAIL_USER / GMAIL_APP_PASSWORD missing in Netlify).");

  const { data, error } = await supabase.rpc("web_get_checkout", { p_token: token });
  if (error) throw new Error(`Couldn't load the order: ${error.message}`);
  const r = data as CheckoutReceipt | null;
  if (!r) throw new Error("Order not found.");

  const link = `${site()}/shop/order/${token}`;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  if (r.kind === "passes" && r.event) {
    const e = r.event;
    const when = `${fmtDate(e.date)}${e.start_time ? ", " + fmtTime(e.start_time) : ""}${e.end_time ? " – " + fmtTime(e.end_time) : ""}`;
    const lines = r.items
      .map((i) => `<tr><td style="padding:6px 0">${i.qty}× ${esc(i.name)}${i.kind === "pass" ? " pass" : ""}</td><td style="padding:6px 0;text-align:right">${formatPHP(i.qty * i.price)}</td></tr>`)
      .join("");
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1A1A2E;max-width:520px">
  <h2 style="margin:0 0 4px">You're in, ${esc(r.name.split(" ")[0])}! 🎉</h2>
  <p style="margin:0 0 16px;color:#5C5C6E">Your passes for <b>${esc(e.name)}</b> are confirmed (${r.reference}).</p>
  <p style="margin:0 0 4px"><b>${when}</b><br>${esc(e.venue ?? "")}${e.maps_url ? ` · <a href="${e.maps_url}">Open in Maps</a>` : ""}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">${lines}
  <tr><td style="padding:8px 0;border-top:1px solid #eee"><b>Total paid</b></td><td style="padding:8px 0;border-top:1px solid #eee;text-align:right"><b>${formatPHP(r.total)}</b></td></tr></table>
  <p style="margin:20px 0"><a href="${link}" style="background:#A62655;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Show my QR passes</a></p>
  <p style="color:#5C5C6E;font-size:13px">Show the QR codes at the door — one per player. Keep this email handy.</p></div>`;
    await transport.sendMail({
      from: `"${COMPANY.brandName}" <${user}>`,
      to: r.email,
      replyTo: COMPANY.email,
      subject: `Your passes — ${e.name}, ${fmtDate(e.date)}`,
      html,
      text: `You're in! ${r.reference}: ${e.name}, ${when} at ${e.venue ?? ""}. Your QR passes: ${link}`,
    });
    if (!teamCopy) return;
    await transport.sendMail({
      from: `"${COMPANY.brandName} Website" <${user}>`,
      to: COMPANY.email,
      subject: `🎟️ New pass order ${r.reference} — ${formatPHP(r.total)} (verify payment)`,
      text:
        `${r.name} (${r.email}) — ${e.name}, ${fmtDate(e.date)}
` +
        r.items.map((i) => `${i.qty}× ${i.name}`).join("\n") +
        `\n\nTotal ${formatPHP(r.total)} — screenshot is waiting in Website studio → Orders.\n${site()}/dashboard/website/orders`,
    });
    return;
  }

  const packs = r.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0"><b>${esc(i.name)}</b><br><span style="color:#5C5C6E;font-size:13px">${mixText(i.mix)}${
          i.deliveries > 1 ? " · every week for " + i.deliveries + " weeks" : ""
        }</span></td><td style="padding:6px 0;text-align:right">${formatPHP(i.price)}</td></tr>`,
    )
    .join("");
  const drops = r.deliveries.map((d, n) => `<li>${n + 1}. ${fmtDate(d.date)}</li>`).join("");

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1A1A2E;max-width:520px">
  <h2 style="margin:0 0 4px">Thanks, ${esc(r.name.split(" ")[0])}! 🎉</h2>
  <p style="margin:0 0 16px;color:#5C5C6E">Your order <b>${r.reference}</b> is confirmed.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${packs}
  <tr><td style="padding:6px 0;color:#5C5C6E">Delivery</td><td style="text-align:right">${formatPHP(r.delivery_total)}</td></tr>
  <tr><td style="padding:8px 0;border-top:1px solid #eee"><b>Total paid</b></td><td style="padding:8px 0;border-top:1px solid #eee;text-align:right"><b>${formatPHP(r.total)}</b></td></tr></table>
  <p style="margin:16px 0 4px"><b>Delivering to</b><br>${esc(r.address ?? "").replace(/\n/g, "<br>")}</p>
  <p style="margin:12px 0 4px"><b>Delivery ${r.deliveries.length > 1 ? "dates" : "date"}</b></p><ul style="margin:0;padding-left:18px">${drops}</ul>
  <p style="margin:20px 0"><a href="${link}" style="background:#A62655;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">View your order</a></p>
  <p style="color:#5C5C6E;font-size:12px">Questions? Just reply to this email.</p></div>`;

  await transport.sendMail({
    from: `"${COMPANY.brandName}" <${user}>`,
    to: r.email,
    replyTo: COMPANY.email,
    subject: `Order confirmed — ${r.reference}`,
    html,
    text: `Thanks ${r.name}! Your order ${r.reference} is confirmed. Total ${formatPHP(r.total)}. View it: ${link}`,
  });

  if (!teamCopy) return;
  await transport.sendMail({
    from: `"${COMPANY.brandName} Website" <${user}>`,
    to: COMPANY.email,
    subject: `🛒 New website order ${r.reference} — ${formatPHP(r.total)} (verify payment)`,
    text:
      `${r.name} (${r.email})\n${r.address}\n\n` +
      r.items.map((i) => `${i.name}: ${mixText(i.mix)}`).join("\n") +
      `\n\nTotal ${formatPHP(r.total)} — screenshot is waiting in Website studio → Orders.\n` +
      `${site()}/dashboard/website/orders`,
  });
}
