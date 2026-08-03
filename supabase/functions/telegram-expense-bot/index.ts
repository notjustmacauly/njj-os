// Telegram → Expense bot.
//
// Flow: teammate DMs the bot a payment screenshot (optional caption like
// "grab to market, rcbc, logistics") → Claude reads amount/date/vendor/ref +
// suggests a category → bot replies with Confirm / Change category / Reject →
// on Confirm the expense is logged via log_expense_from_telegram().
//
// Secrets (set in Supabase → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN        – from BotFather
//   TELEGRAM_WEBHOOK_SECRET   – any random string; also passed to setWebhook
//   ANTHROPIC_API_KEY         – from console.anthropic.com
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TG_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RECEIPT_BUCKET = "telegram-receipts";
const DEFAULT_ACCOUNT = "RCBC Main";

const CATEGORIES = [
  "Production", "Human", "Logistics", "Event", "Marketing", "Utilities",
  "Rent", "R&D", "NJF", "Legal", "Taxes", "CSM", "TBM", "Office",
  "Equipment", "Liabilities", "Misc",
];

// caption keyword → account code (checked in this order)
const ACCOUNT_HINTS: Array<[RegExp, string]> = [
  [/gcash\s*expense/i, "GCash Expense"],
  [/rcbc/i, "RCBC Main"],
  [/gcash/i, "GCash Main"],
  [/corporate/i, "Corporate Account"],
  [/xendit/i, "Xendit"],
  [/\bcash\b/i, "Cash"],
];

const db = createClient(SUPABASE_URL, SERVICE_KEY);
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;

// Base64-encode bytes in chunks (spreading a large array into fromCharCode
// overflows the call stack).
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// ── Telegram helpers ────────────────────────────────────────────
async function tg(method: string, body: unknown) {
  const r = await fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
const send = (chat_id: number, text: string, reply_markup?: unknown) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", reply_markup });
const editText = (chat_id: number, message_id: number, text: string, reply_markup?: unknown) =>
  tg("editMessageText", { chat_id, message_id, text, parse_mode: "HTML", reply_markup });
const answer = (id: string, text?: string) => tg("answerCallbackQuery", { callback_query_id: id, text });

function summaryText(c: any): string {
  const acct = c.account_code ?? DEFAULT_ACCOUNT;
  return (
    `🧾 <b>₱${Number(c.amount ?? 0).toLocaleString()}</b> · <b>${c.category ?? "Misc"}</b>\n` +
    `Vendor: ${c.vendor ?? "—"}\n` +
    `Date: ${c.expense_date ?? "—"}   Ref: ${c.payment_ref ?? "—"}\n` +
    `Account: ${acct}\n\n` +
    `Log this expense?`
  );
}
function confirmKeyboard(id: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Confirm", callback_data: `c:${id}` },
      { text: "✏️ Category", callback_data: `m:${id}` },
      { text: "❌ Reject", callback_data: `x:${id}` },
    ]],
  };
}
function categoryKeyboard(id: string) {
  const rows: any[] = [];
  for (let i = 0; i < CATEGORIES.length; i += 3) {
    rows.push(
      CATEGORIES.slice(i, i + 3).map((cat, j) => ({
        text: cat,
        callback_data: `s:${id}:${i + j}`,
      })),
    );
  }
  return { inline_keyboard: rows };
}

// ── Claude vision extraction ────────────────────────────────────
async function extract(imageB64: string, mediaType: string, caption: string) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      amount: { type: "number" },
      expense_date: { type: "string" },
      vendor: { type: "string" },
      reference: { type: "string" },
      category: { type: "string", enum: CATEGORIES },
    },
    required: ["amount", "expense_date", "vendor", "reference", "category"],
  };
  const prompt =
    "You are reading a payment/receipt screenshot for a Philippine juice & events business. " +
    "Extract the total amount paid (number only, PHP), the payment date (YYYY-MM-DD; if only a " +
    "relative date is visible, use it as best you can), the vendor/merchant/recipient name, and " +
    "the reference/transaction number. Then choose the single best expense category from the " +
    "provided list. Record the details using the record_expense tool. " +
    "If the user caption gives a hint, prefer it. " +
    (caption ? `User caption: "${caption}".` : "No caption.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      // Force a structured result via a single tool call (the reliable,
      // widely-supported way to get JSON back from the Messages API).
      tools: [{
        name: "record_expense",
        description: "Record the payment details extracted from the screenshot.",
        input_schema: schema,
      }],
      tool_choice: { type: "tool", name: "record_expense" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageB64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${JSON.stringify(j)}`);
  const toolBlock = (j.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolBlock) throw new Error("no tool_use block in Claude response");
  return toolBlock.input;
}

function accountFromCaption(caption: string): string {
  for (const [re, code] of ACCOUNT_HINTS) if (re.test(caption)) return code;
  return DEFAULT_ACCOUNT;
}

// ── Handlers ────────────────────────────────────────────────────
async function isAllowed(uid: number): Promise<boolean> {
  const { data } = await db.from("telegram_allowed_users")
    .select("id").eq("telegram_user_id", uid).eq("is_active", true).maybeSingle();
  return !!data;
}

async function handlePhoto(msg: any) {
  const chatId = msg.chat.id;
  const uid = msg.from.id;
  const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || msg.from.username || "Telegram user";
  const caption: string = msg.caption ?? "";

  if (!(await isAllowed(uid))) {
    await send(chatId, `You're not authorised to log expenses yet.\nYour Telegram ID is <code>${uid}</code> — ask the owner to add you.`);
    return;
  }

  await send(chatId, "🔎 Reading your screenshot…");

  // biggest photo size
  const photo = msg.photo[msg.photo.length - 1];
  const fileInfo = await tg("getFile", { file_id: photo.file_id });
  const filePath = fileInfo.result.file_path as string;
  const fileResp = await fetch(`https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`);
  const bytes = new Uint8Array(await fileResp.arrayBuffer());
  const b64 = toBase64(bytes);
  const mediaType = filePath.endsWith(".png") ? "image/png" : "image/jpeg";

  // store the receipt (private) + signed URL
  const objectPath = `${uid}/${photo.file_unique_id}.jpg`;
  await db.storage.from(RECEIPT_BUCKET).upload(objectPath, bytes, { contentType: mediaType, upsert: true });
  const { data: signed } = await db.storage.from(RECEIPT_BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 365);

  let ex: any;
  try {
    ex = await extract(b64, mediaType, caption);
  } catch (_e) {
    await send(chatId, "⚠️ I couldn't read that screenshot. Try a clearer image, or log it in the app.");
    return;
  }

  const account = accountFromCaption(caption);
  const { data: cap } = await db.from("telegram_captures").insert({
    telegram_user_id: uid, chat_id: chatId, logged_by_name: name,
    receipt_url: signed?.signedUrl ?? null,
    amount: ex.amount, expense_date: ex.expense_date, vendor: ex.vendor,
    payment_ref: ex.reference, category: ex.category, account_code: account,
    raw_caption: caption || null, extracted: ex,
  }).select().single();

  await send(chatId, summaryText(cap), confirmKeyboard(cap.id));
}

async function handleCallback(cb: any) {
  const data: string = cb.data;
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const [action, id, idx] = data.split(":");

  const { data: cap } = await db.from("telegram_captures").select("*").eq("id", id).maybeSingle();
  if (!cap) { await answer(cb.id, "Expired"); return; }

  if (action === "x") {
    await db.from("telegram_captures").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id);
    await editText(chatId, messageId, "❌ Rejected — nothing logged.");
    await answer(cb.id);
    return;
  }
  if (action === "m") {
    await editText(chatId, messageId, "Pick a category:", categoryKeyboard(id));
    await answer(cb.id);
    return;
  }
  if (action === "s") {
    const category = CATEGORIES[Number(idx)] ?? cap.category;
    const { data: upd } = await db.from("telegram_captures")
      .update({ category, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    await editText(chatId, messageId, summaryText(upd), confirmKeyboard(id));
    await answer(cb.id, `Category → ${category}`);
    return;
  }
  if (action === "c") {
    if (cap.status === "confirmed") { await answer(cb.id, "Already logged"); return; }
    const { data: expenseId, error } = await db.rpc("log_expense_from_telegram", {
      p_telegram_user_id: cap.telegram_user_id,
      p_amount: cap.amount,
      p_category: cap.category,
      p_description: cap.vendor ? `${cap.vendor}${cap.raw_caption ? " — " + cap.raw_caption : ""}` : (cap.raw_caption || "Telegram expense"),
      p_account_code: cap.account_code ?? DEFAULT_ACCOUNT,
      p_expense_date: cap.expense_date,
      p_vendor: cap.vendor,
      p_payment_ref: cap.payment_ref,
      p_receipt_url: cap.receipt_url,
      p_logged_by_name: cap.logged_by_name,
      p_idempotency_key: `tg-${cap.id}`,
    });
    if (error) {
      await answer(cb.id, "Error");
      await editText(chatId, messageId, `⚠️ Couldn't log: ${error.message}`);
      return;
    }
    await db.from("telegram_captures").update({ status: "confirmed", expense_id: expenseId, updated_at: new Date().toISOString() }).eq("id", id);
    await editText(chatId, messageId, summaryText(cap) + "\n\n✅ <b>Logged to Expenses.</b>");
    await answer(cb.id, "Logged ✅");
    return;
  }
  await answer(cb.id);
}

Deno.serve(async (req) => {
  if (TG_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== TG_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }

  try {
    if (update.message?.photo) await handlePhoto(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) {
      await send(update.message.chat.id,
        "👋 Send me a payment <b>screenshot</b> (optionally with a caption like \"grab to market, rcbc, logistics\") and I'll log it as an expense after you confirm.");
    }
  } catch (e) {
    console.error(e);
  }
  return new Response("ok");
});
