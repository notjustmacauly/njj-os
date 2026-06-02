// Dispatches a single in-app notification out to phone push + email,
// honoring each recipient's preferences. Invoked by the AFTER INSERT trigger
// on public.notifications (see migration 20260602100100).
//
// Push (Web Push / VAPID) and email (Gmail SMTP) are each independent and
// guarded by whether their secrets exist in Vault — so push works on its own,
// and email switches on the moment the gmail_* secrets are added. No redeploy.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// SUPABASE_URL + SERVICE_ROLE_KEY are auto-injected into every Edge Function.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://notjustos.netlify.app";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// All delivery secrets live in Supabase Vault and are read through a
// service-role-only RPC. Cached for the lifetime of the warm instance.
type Secrets = {
  notification_webhook_secret?: string;
  vapid_public_key?: string;
  vapid_private_key?: string;
  vapid_subject?: string;
  gmail_user?: string;
  gmail_app_password?: string;
};
let cachedSecrets: Secrets | null = null;
let vapidConfigured = false;

async function getSecrets(): Promise<Secrets> {
  if (cachedSecrets) return cachedSecrets;
  const { data, error } = await admin.rpc("get_notification_secrets");
  cachedSecrets = (error ? {} : (data as Secrets)) ?? {};
  if (
    !vapidConfigured &&
    cachedSecrets.vapid_public_key &&
    cachedSecrets.vapid_private_key
  ) {
    webpush.setVapidDetails(
      cachedSecrets.vapid_subject || "mailto:notjustmacauly@gmail.com",
      cachedSecrets.vapid_public_key,
      cachedSecrets.vapid_private_key,
    );
    vapidConfigured = true;
  }
  return cachedSecrets;
}

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  recipient_user_id: string | null;
  recipient_role: string | null;
  created_by_user_id: string | null;
};

async function resolveRecipientIds(n: Notification): Promise<string[]> {
  if (n.recipient_user_id) return [n.recipient_user_id];
  if (n.recipient_role) {
    const { data } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", n.recipient_role);
    return (data ?? []).map((r) => r.user_id as string);
  }
  return [];
}

async function sendPush(userId: string, n: Notification) {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: n.title,
    body: n.message ?? "",
    url: n.link ? `${APP_BASE_URL}${n.link}` : APP_BASE_URL,
    tag: n.type,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        await admin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (err) {
        // 404/410 mean the subscription is dead — prune it.
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("push send failed", status, err);
        }
      }
    }),
  );
}

function emailHtml(n: Notification): string {
  const url = n.link ? `${APP_BASE_URL}${n.link}` : APP_BASE_URL;
  return `<!doctype html><html><body style="margin:0;background:#FBF6EE;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1A1A2E;">
  <div style="max-width:480px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border:1px solid #E8E0D6;border-radius:14px;padding:24px;">
      <p style="text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#A62655;font-weight:700;margin:0 0 8px;">NotJust OS</p>
      <h1 style="font-size:18px;margin:0 0 8px;">${escapeHtml(n.title)}</h1>
      ${n.message ? `<p style="font-size:14px;color:#5C5C6E;margin:0 0 20px;">${escapeHtml(n.message)}</p>` : ""}
      <a href="${url}" style="display:inline-block;background:#A62655;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px;">Open in NotJust OS</a>
    </div>
    <p style="font-size:11px;color:#5C5C6E;text-align:center;margin:16px 0 0;">You're receiving this because notifications are on for your account. Turn them off in Settings → Notifications.</p>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function sendEmail(
  userId: string,
  n: Notification,
  gmailUser: string,
  gmailPass: string,
) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return;
  const to = data.user.email;

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPass },
    },
  });
  try {
    await client.send({
      from: `NotJust OS <${gmailUser}>`,
      to,
      subject: n.title,
      content: `${n.title}\n\n${n.message ?? ""}\n\n${n.link ? `${APP_BASE_URL}${n.link}` : APP_BASE_URL}`,
      html: emailHtml(n),
    });
  } catch (err) {
    console.error("email send failed", err);
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  try {
    const secrets = await getSecrets();

    // Custom auth: the DB trigger sends a shared secret. Reject anything else.
    const provided = req.headers.get("x-webhook-secret");
    if (
      !secrets.notification_webhook_secret ||
      provided !== secrets.notification_webhook_secret
    ) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pushEnabled = Boolean(secrets.vapid_public_key && secrets.vapid_private_key);
    const emailEnabled = Boolean(secrets.gmail_user && secrets.gmail_app_password);

    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: n, error } = await admin
      .from("notifications")
      .select(
        "id, type, title, message, link, recipient_user_id, recipient_role, created_by_user_id",
      )
      .eq("id", notification_id)
      .single<Notification>();
    if (error || !n) {
      return new Response(JSON.stringify({ error: "notification not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ids = (await resolveRecipientIds(n)).filter(
      (id) => id !== n.created_by_user_id, // don't notify the person who triggered it
    );

    // Load prefs for all recipients at once; missing row = all on.
    const { data: prefRows } = await admin
      .from("notification_prefs")
      .select("user_id, email_enabled, push_enabled")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const prefs = new Map(prefRows?.map((p) => [p.user_id, p]) ?? []);

    let pushed = 0;
    let mailed = 0;
    await Promise.all(
      ids.map(async (id) => {
        const p = prefs.get(id);
        const wantPush = p?.push_enabled ?? true;
        const wantEmail = p?.email_enabled ?? true;
        if (pushEnabled && wantPush) {
          await sendPush(id, n);
          pushed++;
        }
        if (emailEnabled && wantEmail) {
          await sendEmail(id, n, secrets.gmail_user!, secrets.gmail_app_password!);
          mailed++;
        }
      }),
    );

    return new Response(
      JSON.stringify({ ok: true, recipients: ids.length, pushed, mailed }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("dispatch error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
