import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Result = {
  status: "ok" | "already";
  holder: string | null;
  sport: string;
  event: string;
  event_date?: string;
  code: string;
  checked_in_at?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opened by scanning a pass QR with any phone camera while signed in to the OS.
// Visiting the page checks the pass in (idempotent — a second scan says so).
export default async function CheckInPage({ params }: { params: { token: string } }) {
  let result: Result | null = null;
  let error: string | null = null;
  if (!UUID.test(params.token)) {
    error = "This isn't a valid pass code.";
  } else {
    const supabase = await createClient();
    const { data, error: err } = await supabase.rpc("check_in_pass", { p_token: params.token });
    if (err) error = err.message;
    else result = data as Result;
  }

  const tone = error ? "bad" : result?.status === "already" ? "warn" : "ok";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;

  return (
    <div className="max-w-md mx-auto pt-6">
      <div
        className={
          tone === "ok"
            ? "rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-8 text-center"
            : tone === "warn"
              ? "rounded-2xl bg-yellow/10 ring-1 ring-yellow/40 p-8 text-center"
              : "rounded-2xl bg-salmonBg ring-1 ring-coral/30 p-8 text-center"
        }
      >
        <Icon
          className={
            tone === "ok" ? "w-16 h-16 mx-auto text-emerald-600" : tone === "warn" ? "w-16 h-16 mx-auto text-yellow" : "w-16 h-16 mx-auto text-coral"
          }
        />
        <h1 className="mt-4 font-serif font-bold text-3xl text-ink">
          {tone === "ok" ? "Checked in" : tone === "warn" ? "Already checked in" : "Not valid"}
        </h1>
        {result ? (
          <div className="mt-4 space-y-1 text-ink">
            <div className="text-xl font-semibold">{result.holder ?? "Guest"}</div>
            <div>
              {result.sport} · {result.event}
            </div>
            <div className="text-xs text-inkSoft font-mono">{result.code}</div>
            {result.status === "already" && result.checked_in_at ? (
              <div className="text-sm text-inkSoft">
                First scanned{" "}
                {new Date(result.checked_in_at).toLocaleTimeString("en-PH", {
                  timeZone: "Asia/Manila",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-ink">{error}</p>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-inkSoft">Scan the next pass with your phone camera.</p>
    </div>
  );
}
