"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, CheckCircle2, XCircle, ChevronRight, FileText, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type Run = {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  label: string;
  status: "draft" | "approved" | "void";
  account_code: string | null;
  total_amount: number | null;
  created_at: string;
  approved_at: string | null;
  void_reason: string | null;
};
export type BreakdownRow = { label: string; date: string; start: string; end: string; hours: string; rate: string; amount: string; break1h: boolean };
export type Item = {
  id: string;
  run_id: string;
  user_id: string | null;
  person_id: string | null;
  name: string;
  pay_type: string;
  rate: number | null;
  hours: number;
  base_amount: number;
  adjustment: number;
  adjust_note: string | null;
  net_amount: number;
  account_code: string | null;
  breakdown: BreakdownRow[] | null;
  share_token: string;
};
export type PayMember = {
  user_id: string;
  display_name: string;
  title: string | null;
  pay_type: string | null;
  pay_rate: number | null;
  unpaid_break_min: number | null;
  status: string | null;
};
export type PayPerson = {
  id: string;
  name: string;
  pay_type: "fixed" | "manual";
  default_amount: number;
  active: boolean;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const PAY_TYPE_LABEL: Record<string, string> = { hourly: "Hourly", fixed: "Fixed", manual: "Manual" };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function phToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

const STATUS_TONE: Record<Run["status"], string> = {
  draft: "bg-yellowBg text-yellow",
  approved: "bg-greenBg text-green",
  void: "bg-creamDk text-inkSoft line-through",
};

export function PayrollClient({
  runs,
  items,
  members,
  people,
  accounts,
}: {
  runs: Run[];
  items: Item[];
  members: PayMember[];
  people: PayPerson[];
  accounts: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"runs" | "timesheet">("runs");
  const [showNew, setShowNew] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [openRun, setOpenRun] = React.useState<Run | null>(null);
  const [tsPreset, setTsPreset] = React.useState<TsPreset | null>(null);

  function editTimesheet(run: Run, it: Item) {
    const subjectKey = it.user_id ? `m:${it.user_id}` : it.person_id ? `p:${it.person_id}` : "other";
    const days = (Array.isArray(it.breakdown) ? it.breakdown : [])
      .filter((b) => (b as { date?: string }).date)
      .map((b) => ({
        date: String((b as { date?: string }).date ?? ""),
        start: String((b as { start?: string }).start ?? ""),
        end: String((b as { end?: string }).end ?? ""),
        break1h: Boolean((b as { break1h?: boolean }).break1h),
        rate: b.rate != null ? String(b.rate) : "",
        amount: b.amount != null ? String(b.amount) : "",
      }));
    setOpenRun(null);
    setTsPreset({
      subjectKey,
      adhocName: subjectKey === "other" ? it.name : "",
      start: run.period_start,
      end: run.period_end,
      targetRunId: run.id,
      account: it.account_code ?? "",
      days,
    });
    setTab("timesheet");
  }

  const itemsByRun = React.useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.run_id) ?? [];
      list.push(it);
      map.set(it.run_id, list);
    }
    return map;
  }, [items]);

  const runTotal = (r: Run) =>
    r.total_amount != null ? r.total_amount : (itemsByRun.get(r.id) ?? []).reduce((s, it) => s + Number(it.net_amount), 0);

  const onPayrollCount = members.filter((m) => m.pay_type).length + people.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">Payroll</h1>
          <p className="text-sm text-inkSoft mt-1">
            Semi-monthly runs. Hours pull from time-in; you review, approve, and it posts one expense.
            Salaries stay private to owner &amp; partner.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowSetup(true)}>
            <Settings2 className="w-4 h-4" /> Pay setup
          </Button>
          {tab === "runs" ? (
            <Button onClick={() => setShowNew(true)} disabled={onPayrollCount === 0}>
              <Plus className="w-4 h-4" /> New run
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["runs", "timesheet"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setTsPreset(null); }}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition capitalize",
              tab === t ? "text-berry border-berry" : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {t === "runs" ? "Payroll runs" : "Timesheet"}
          </button>
        ))}
      </div>

      {tab === "timesheet" ? (
        <TimesheetTab
          key={tsPreset ? `${tsPreset.subjectKey}:${tsPreset.targetRunId}` : "fresh"}
          members={members}
          people={people}
          accounts={accounts}
          draftRuns={runs.filter((r) => r.status === "draft")}
          preset={tsPreset}
          onSaved={(runId) => {
            router.refresh();
            setTsPreset(null);
            setTab("runs");
            const r = runs.find((x) => x.id === runId);
            if (r) setOpenRun(r);
          }}
        />
      ) : (
      <>
      {onPayrollCount === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-6 text-sm text-inkSoft">
          No one is on payroll yet. Open <button className="text-berry font-semibold hover:underline" onClick={() => setShowSetup(true)}>Pay setup</button> to
          set each person&rsquo;s pay type and rate first.
        </div>
      ) : null}

      {/* Runs table */}
      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Period</th>
              <th className="text-left font-semibold px-4 py-2">Pay date</th>
              <th className="text-right font-semibold px-4 py-2">People</th>
              <th className="text-right font-semibold px-4 py-2">Total</th>
              <th className="text-left font-semibold px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-inkSoft">No payroll runs yet.</td>
              </tr>
            ) : (
              runs.map((r) => {
                const list = itemsByRun.get(r.id) ?? [];
                return (
                  <tr key={r.id} className="hover:bg-cream/40 cursor-pointer" onClick={() => setOpenRun(r)}>
                    <td className="px-4 py-2 font-medium text-ink">{r.label}</td>
                    <td className="px-4 py-2 text-inkSoft">{fmtDate(r.pay_date)}</td>
                    <td className="px-4 py-2 text-right text-inkSoft">{list.length}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-ink">{peso.format(runTotal(r))}</td>
                    <td className="px-4 py-2">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_TONE[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-inkSoft"><ChevronRight className="w-4 h-4 inline" /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {showNew ? (
        <NewRunModal onClose={() => setShowNew(false)} onSaved={(id) => { setShowNew(false); router.refresh(); const r = runs.find((x) => x.id === id); if (r) setOpenRun(r); }} />
      ) : null}
      {showSetup ? (
        <PaySetupModal members={members} people={people} onClose={() => setShowSetup(false)} onChanged={() => router.refresh()} />
      ) : null}
      {openRun ? (
        <RunModal
          run={openRun}
          items={itemsByRun.get(openRun.id) ?? []}
          accounts={accounts}
          onClose={() => setOpenRun(null)}
          onChanged={() => { setOpenRun(null); router.refresh(); }}
          onEditTimesheet={(it) => editTimesheet(openRun, it)}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Timesheet */
function datesBetween(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
  const out: string[] = [];
  let d = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  let guard = 0;
  while (d.getTime() <= e.getTime() && guard < 120) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
    guard++;
  }
  return out;
}

type TDay = { date: string; start: string; end: string; break1h: boolean; rate: string; amount: string };
export type TsPreset = { subjectKey: string; adhocName: string; start: string; end: string; targetRunId: string; account: string; days: TDay[] };

function TimesheetTab({
  members,
  people,
  accounts,
  draftRuns,
  preset,
  onSaved,
}: {
  members: PayMember[];
  people: PayPerson[];
  accounts: Array<{ code: string; name: string }>;
  draftRuns: Run[];
  preset?: TsPreset | null;
  onSaved: (runId: string) => void;
}) {
  const toast = useToast();
  const today = phToday();
  const [ty, tmn, tdy] = today.split("-").map(Number);
  const firstHalf = tdy <= 15;
  const defStart = firstHalf ? `${ty}-${pad(tmn)}-01` : `${ty}-${pad(tmn)}-16`;
  const defEnd = firstHalf ? `${ty}-${pad(tmn)}-15` : `${ty}-${pad(tmn)}-${pad(lastDayOfMonth(ty, tmn))}`;

  const [subject, setSubject] = React.useState(preset?.subjectKey ?? "");
  const [adhoc, setAdhoc] = React.useState(preset?.adhocName ?? "");
  const [start, setStart] = React.useState(preset?.start ?? defStart);
  const [end, setEnd] = React.useState(preset?.end ?? defEnd);
  const [days, setDays] = React.useState<TDay[] | null>(null);
  const [target, setTarget] = React.useState(preset?.targetRunId ?? "");
  const [account, setAccount] = React.useState(preset?.account ?? "");
  const [busy, setBusy] = React.useState(false);

  const activeMembers = members.filter((m) => (m.status ?? "active") === "active");

  function netHrs(x: TDay): number {
    return Math.max(0, round2(hoursBetween(x.start, x.end) - (x.break1h ? 1 : 0)));
  }
  const recalc = (x: TDay): TDay => (x.rate.trim() !== "" ? { ...x, amount: String(round2(netHrs(x) * (Number(x.rate) || 0))) } : x);

  async function build(prefill?: TDay[]) {
    const ds = datesBetween(start, end);
    if (ds.length === 0) return toast.push("Pick a valid start and end date.", "error");
    let out: TDay[] = ds.map((date) => ({ date, start: "", end: "", break1h: false, rate: "", amount: "" }));
    // 1) prefill from an existing timesheet (editing a line)
    if (prefill && prefill.length) {
      const byDate = new Map(prefill.filter((d) => d.date).map((d) => [d.date, d]));
      out = out.map((r) => (byDate.has(r.date) ? { ...r, ...byDate.get(r.date)! } : r));
    }
    // 2) auto-fill clock in/out for system-timed staff (empty rows only)
    if (subject.startsWith("m:")) {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_attendance_days", { p_user_id: subject.slice(2), p_start: start, p_end: end });
      const att = new Map<string, { start_time: string; end_time: string }>(
        ((data ?? []) as Array<{ work_date: string; start_time: string; end_time: string }>).map((r) => [r.work_date, { start_time: r.start_time, end_time: r.end_time }]),
      );
      out = out.map((r) => {
        const a = att.get(r.date);
        if (a && !r.start && !r.end) return recalc({ ...r, start: a.start_time || "", end: a.end_time || "" });
        return r;
      });
    }
    setDays(out);
    if (!preset) {
      const match = draftRuns.find((r) => r.period_start === start && r.period_end === end);
      setTarget(match ? match.id : "");
    }
  }

  // When opened from a run line, build immediately with its existing days.
  const inited = React.useRef(false);
  React.useEffect(() => {
    if (preset && !inited.current) {
      inited.current = true;
      void build(preset.days);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  function setDay<K extends keyof TDay>(i: number, k: K, v: TDay[K]) {
    setDays((prev) => {
      if (!prev) return prev;
      const next = prev.map((x, idx) => (idx === i ? { ...x, [k]: v } : x));
      const x = next[i];
      if (x.rate.trim() !== "") x.amount = String(round2(netHrs(x) * (Number(x.rate) || 0)));
      return next;
    });
  }

  const totalPay = (days ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalHrs = (days ?? []).reduce((s, x) => s + netHrs(x), 0);

  function subjectInfo() {
    if (subject.startsWith("m:")) {
      const m = activeMembers.find((x) => x.user_id === subject.slice(2));
      return { user_id: m?.user_id ?? null, person_id: null as string | null, name: m?.display_name ?? "" };
    }
    if (subject.startsWith("p:")) {
      const p = people.find((x) => x.id === subject.slice(2));
      return { user_id: null as string | null, person_id: p?.id ?? null, name: p?.name ?? "" };
    }
    return { user_id: null as string | null, person_id: null as string | null, name: adhoc.trim() };
  }

  async function save() {
    if (!days) return;
    const info = subjectInfo();
    if (!info.name) return toast.push("Choose an employee (or type a name).", "error");
    const rows = days
      .filter((x) => (Number(x.amount) || 0) > 0 || x.start || x.end)
      .map((x) => ({
        label: `${x.date} · ${weekdayOf(x.date)}`,
        date: x.date, start: x.start, end: x.end, break1h: x.break1h,
        hours: hoursBetween(x.start, x.end), rate: Number(x.rate) || 0, amount: Number(x.amount) || 0,
      }));
    if (rows.length === 0) return toast.push("Fill in at least one day.", "error");
    const base = round2(rows.reduce((s, r) => s + r.amount, 0));
    const hours = round2(rows.reduce((s, r) => s + Math.max(0, r.hours - (r.break1h ? 1 : 0)), 0));

    setBusy(true);
    const supabase = createClient();
    let runId = target;
    if (!runId) {
      const { data, error } = await supabase.rpc("create_payroll_run", { p_period_start: start, p_period_end: end, p_pay_date: end, p_label: null });
      if (error) { setBusy(false); return toast.push(error.message, "error"); }
      runId = data as string;
    }
    const { error: upErr } = await supabase.rpc("upsert_timesheet_line", {
      p_run_id: runId, p_user_id: info.user_id, p_person_id: info.person_id, p_name: info.name,
      p_breakdown: rows, p_base: base, p_hours: hours, p_account_code: account || null,
    });
    setBusy(false);
    if (upErr) return toast.push(upErr.message, "error");
    toast.push(`Timesheet added to payroll · ${peso.format(base)}`, "success");
    onSaved(runId);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label>Employee</Label>
            <Select value={subject} onChange={(e) => { setSubject(e.target.value); setDays(null); }} disabled={busy}>
              <option value="">— choose —</option>
              {people.length > 0 ? (
                <optgroup label="Paper / off-system">
                  {people.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
                </optgroup>
              ) : null}
              {activeMembers.length > 0 ? (
                <optgroup label="Team (system)">
                  {activeMembers.map((m) => <option key={m.user_id} value={`m:${m.user_id}`}>{m.display_name}</option>)}
                </optgroup>
              ) : null}
              <option value="other">Someone else…</option>
            </Select>
            {subject === "other" ? (
              <Input value={adhoc} onChange={(e) => setAdhoc(e.target.value)} placeholder="Type their name" disabled={busy} className="mt-1" />
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>Start date</Label>
            <DateInput value={start} onChange={(e) => { setStart(e.target.value); setDays(null); }} disabled={busy} />
          </div>
          <div className="space-y-1">
            <Label>End date</Label>
            <DateInput value={end} onChange={(e) => { setEnd(e.target.value); setDays(null); }} disabled={busy} />
          </div>
        </div>
        <Button onClick={() => build()} disabled={busy || !subject || (subject === "other" && !adhoc.trim())}>
          {days ? "Rebuild" : "Build timesheet"}
        </Button>
      </div>

      {days ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
          <div className="overflow-x-auto">
            <div className="min-w-[660px] space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-smallcaps text-inkSoft">
                <span className="w-28">Date</span>
                <span className="w-10"></span>
                <span className="w-20">Start</span>
                <span className="w-20">End</span>
                <span className="w-16 text-center">−1h break</span>
                <span className="w-14 text-right">Hours</span>
                <span className="w-20 text-right">Rate ₱/hr</span>
                <span className="w-28 text-right">Pay ₱</span>
              </div>
              {days.map((x, i) => (
                <div key={x.date} className={cn("flex items-center gap-1.5 rounded", isWeekend(x.date) && "bg-salmonBg/30")}>
                  <span className="w-28 text-xs text-ink">{fmtDate(x.date)}</span>
                  <span className={cn("w-10 text-[10px] font-semibold", isWeekend(x.date) ? "text-coral" : "text-inkSoft")}>{weekdayOf(x.date)}</span>
                  <Input type="time" value={x.start} onChange={(e) => setDay(i, "start", e.target.value)} className="w-20" disabled={busy} />
                  <Input type="time" value={x.end} onChange={(e) => setDay(i, "end", e.target.value)} className="w-20" disabled={busy} />
                  <span className="w-16 flex justify-center">
                    <input type="checkbox" checked={x.break1h} onChange={() => setDay(i, "break1h", !x.break1h)} disabled={busy} title="Deduct 1h unpaid break" />
                  </span>
                  <span className={cn("w-14 text-right text-xs tabular-nums", x.break1h ? "text-coral" : "text-inkSoft")}>{netHrs(x).toFixed(2)}</span>
                  <NumberInput min="0" step="0.01" value={x.rate} onChange={(e) => setDay(i, "rate", e.target.value)} placeholder="—" className="w-20 text-right" disabled={busy} />
                  <NumberInput prefix="₱" min="0" step="0.01" value={x.amount} onChange={(e) => setDay(i, "amount", e.target.value)} placeholder="0" className="w-28 text-right" disabled={busy} />
                </div>
              ))}
              <div className="flex items-center gap-1.5 pt-1 border-t border-border text-xs font-semibold text-ink">
                <span className="w-28">Total</span>
                <span className="w-10"></span><span className="w-20"></span><span className="w-20"></span><span className="w-16"></span>
                <span className="w-14 text-right tabular-nums">{totalHrs.toFixed(2)}</span>
                <span className="w-20"></span>
                <span className="w-28 text-right tabular-nums">{peso.format(totalPay)}</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-inkSoft">Type a <b>rate</b> to auto-fill that day&rsquo;s pay from hours, or just type the <b>pay</b> for a flat day (weekends are shaded).</p>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Add to</Label>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy} className="w-64">
                <option value="">＋ New draft run · {fmtDate(start)}–{fmtDate(end)}</option>
                {draftRuns.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Pay from</Label>
              <Select value={account} onChange={(e) => setAccount(e.target.value)} disabled={busy} className="w-40">
                <option value="">— set later —</option>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            </div>
            <Button onClick={save} disabled={busy || totalPay <= 0}>{busy ? "Saving…" : "Add to payroll"}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ New run */
function NewRunModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const today = phToday();
  const [y, m, d] = today.split("-").map(Number);
  const firstHalf = d <= 15;
  const start = firstHalf ? `${y}-${pad(m)}-01` : `${y}-${pad(m)}-16`;
  const end = firstHalf ? `${y}-${pad(m)}-15` : `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;

  const [periodStart, setPeriodStart] = React.useState(start);
  const [periodEnd, setPeriodEnd] = React.useState(end);
  const [payDate, setPayDate] = React.useState(end);
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (saving) return;
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("create_payroll_run", {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_pay_date: payDate,
      p_label: label.trim() || null,
    });
    setSaving(false);
    if (err) return setError(err.message);
    toast.push("Draft run created — hours pulled from time-in", "success");
    onSaved(data as string);
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title="New payroll run"
      description="Auto-drafts a line for everyone on payroll. You can edit before approving."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create draft"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pr_start" required>Period start</Label>
            <DateInput id="pr_start" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pr_end" required>Period end</Label>
            <DateInput id="pr_end" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled={saving} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pr_pay" required>Pay date</Label>
            <DateInput id="pr_pay" value={payDate} onChange={(e) => setPayDate(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pr_label">Label</Label>
            <Input id="pr_label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="auto" disabled={saving} />
          </div>
        </div>
        {error ? <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">{error}</p> : null}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- Pay setup */
function PaySetupModal({
  members,
  people,
  onClose,
  onChanged,
}: {
  members: PayMember[];
  people: PayPerson[];
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="Pay setup" description="Who is on payroll and how they're paid." size="lg"
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <div className="space-y-6">
        <div>
          <h3 className="font-serif font-bold text-base text-ink mb-1">Team (logs in &amp; times in)</h3>
          <p className="text-xs text-inkSoft mb-2">Hourly pulls hours from time-in. Fixed pays the same amount each run.</p>
          <div className="space-y-2">
            {members.map((m) => <MemberPayRow key={m.user_id} member={m} onChanged={onChanged} />)}
          </div>
        </div>
        <div>
          <h3 className="font-serif font-bold text-base text-ink mb-1">Off-system people (paper timekeeping)</h3>
          <p className="text-xs text-inkSoft mb-2">Production staff etc. They appear on every run with their default amount — edit per run as needed.</p>
          <PeopleEditor people={people} onChanged={onChanged} />
        </div>
      </div>
    </Modal>
  );
}

function MemberPayRow({ member, onChanged }: { member: PayMember; onChanged: () => void }) {
  const toast = useToast();
  const [payType, setPayType] = React.useState(member.pay_type ?? "");
  const [rate, setRate] = React.useState(member.pay_rate != null ? String(member.pay_rate) : "");
  const [brk, setBrk] = React.useState(member.unpaid_break_min != null ? String(member.unpaid_break_min) : "");
  const [saving, setSaving] = React.useState(false);
  const dirty =
    (member.pay_type ?? "") !== payType ||
    String(member.pay_rate ?? "") !== rate ||
    String(member.unpaid_break_min ?? "") !== brk;

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_member_pay", {
      p_user_id: member.user_id,
      p_pay_type: payType || null,
      p_pay_rate: payType && payType !== "manual" && rate ? Number(rate) : null,
      p_break_min: payType === "hourly" && brk ? Math.round(Number(brk)) : 0,
    });
    setSaving(false);
    if (error) return toast.push(error.message, "error");
    toast.push(`Saved ${member.display_name}`, "success");
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border border-border rounded-md px-3 py-2">
      <div className="flex-1 min-w-[120px]">
        <div className="text-sm font-medium text-ink">{member.display_name}</div>
        {member.title ? <div className="text-[11px] text-inkSoft">{member.title}</div> : null}
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Pay type</Label>
        <Select value={payType} onChange={(e) => setPayType(e.target.value)} disabled={saving} className="w-32">
          <option value="">Not on payroll</option>
          <option value="hourly">Hourly</option>
          <option value="fixed">Fixed</option>
          <option value="manual">Manual</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">{payType === "hourly" ? "₱/hour" : payType === "fixed" ? "₱/run" : "Rate"}</Label>
        <NumberInput prefix="₱" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)}
          disabled={saving || !payType || payType === "manual"} className="w-28" />
      </div>
      {payType === "hourly" ? (
        <div className="space-y-1">
          <Label className="text-[10px]">Unpaid break (min/day)</Label>
          <NumberInput min="0" step="15" value={brk} onChange={(e) => setBrk(e.target.value)}
            placeholder="60" disabled={saving} className="w-24" />
        </div>
      ) : null}
      <Button variant="ghost" onClick={save} disabled={saving || !dirty}>{saving ? "…" : "Save"}</Button>
    </div>
  );
}

function PeopleEditor({ people, onChanged }: { people: PayPerson[]; onChanged: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [payType, setPayType] = React.useState<"fixed" | "manual">("manual");
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_payroll_person", {
      p_id: null, p_name: name.trim(), p_pay_type: payType,
      p_default_amount: payType === "fixed" && amount ? Number(amount) : 0, p_active: true,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    setName(""); setAmount(""); setPayType("manual"); setAdding(false);
    onChanged();
  }
  async function remove(p: PayPerson) {
    if (!confirm(`Remove ${p.name} from payroll?`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_payroll_person", { p_id: p.id });
    if (error) return toast.push(error.message, "error");
    onChanged();
  }

  return (
    <div className="space-y-2">
      {people.map((p) => (
        <div key={p.id} className="flex items-center gap-2 border border-border rounded-md px-3 py-2 text-sm">
          <span className="flex-1 font-medium text-ink">{p.name}</span>
          <span className="text-xs text-inkSoft">{PAY_TYPE_LABEL[p.pay_type]}{p.pay_type === "fixed" ? ` · ${peso.format(p.default_amount)}` : ""}</span>
          <button onClick={() => remove(p)} className="text-inkSoft hover:text-coral" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 border border-berry/40 rounded-md px-3 py-2">
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label className="text-[10px]">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production — Juan" disabled={busy} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Type</Label>
            <Select value={payType} onChange={(e) => setPayType(e.target.value as "fixed" | "manual")} disabled={busy} className="w-28">
              <option value="manual">Manual</option>
              <option value="fixed">Fixed</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Default ₱</Label>
            <NumberInput prefix="₱" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy || payType !== "fixed"} className="w-28" />
          </div>
          <Button onClick={add} disabled={busy || !name.trim()}>{busy ? "…" : "Add"}</Button>
          <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add person</Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Run detail */
const round2 = (n: number) => Math.round(n * 100) / 100;
function minutesOf(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function hoursBetween(start: string, end: string): number {
  const s = minutesOf(start), e = minutesOf(end);
  if (s == null || e == null) return 0;
  let d = e - s;
  if (d < 0) d += 1440; // crossed midnight
  return round2(d / 60);
}
function weekdayOf(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "";
  return new Date(date + "T00:00:00+08:00").toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "short" });
}
function isWeekend(date: string): boolean {
  const w = weekdayOf(date);
  return w === "Sat" || w === "Sun";
}

function RunModal({
  run,
  items,
  accounts,
  onClose,
  onChanged,
  onEditTimesheet,
}: {
  run: Run;
  items: Item[];
  accounts: Array<{ code: string; name: string }>;
  onClose: () => void;
  onChanged: () => void;
  onEditTimesheet: (it: Item) => void;
}) {
  const toast = useToast();
  const editable = run.status === "draft";
  const [rows, setRows] = React.useState<Item[]>(items);
  const [busy, setBusy] = React.useState(false);

  // Re-sync when the page data refreshes (e.g. after editing a timesheet), so
  // the amounts here don't show a stale snapshot from when the modal opened.
  React.useEffect(() => { setRows(items); }, [items]);

  const net = (it: Item) => Number(it.base_amount || 0) + Number(it.adjustment || 0);
  const total = rows.reduce((s, it) => s + net(it), 0);
  const acctName = (code: string | null) => accounts.find((a) => a.code === code)?.name ?? code ?? "—";
  const dayCount = (it: Item) => (Array.isArray(it.breakdown) ? it.breakdown.length : 0);

  async function saveAccount(it: Item, code: string) {
    setRows((prev) => prev.map((x) => (x.id === it.id ? { ...x, account_code: code || null } : x)));
    const supabase = createClient();
    const { error } = await supabase.rpc("update_payroll_item", {
      p_item_id: it.id, p_hours: it.hours, p_rate: it.rate, p_base_amount: it.base_amount,
      p_adjustment: it.adjustment, p_adjust_note: it.adjust_note, p_account_code: code || null,
      p_breakdown: it.breakdown ?? [],
    });
    if (error) toast.push(error.message, "error");
  }
  async function setAllAccounts(code: string) {
    if (!code) return;
    for (const it of rows) await saveAccount(it, code);
    toast.push("Pay-from set for all", "success");
  }
  async function removeLine(it: Item) {
    if (!confirm(`Remove ${it.name} from this run?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_payroll_item", { p_item_id: it.id });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    setRows((prev) => prev.filter((x) => x.id !== it.id));
  }
  async function approve() {
    const missing = rows.filter((it) => net(it) !== 0 && !it.account_code);
    if (missing.length > 0) return toast.push(`Set a Pay-from account for: ${missing.map((m) => m.name).join(", ")}`, "error");
    if (!confirm(`Approve payroll of ${peso.format(total)}? This posts one expense per pay-from account and can't be edited after.`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_payroll_run", { p_run_id: run.id });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Payroll approved · expenses posted", "success");
    onChanged();
  }
  async function voidRun() {
    const reason = prompt("Reason for voiding this run? (all its expenses will be reversed)");
    if (reason === null) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("void_payroll_run", { p_run_id: run.id, p_reason: reason });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Run voided · expenses reversed", "success");
    onChanged();
  }
  async function deleteDraft() {
    if (!confirm("Delete this draft run?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_payroll_run", { p_run_id: run.id });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Draft deleted", "success");
    onChanged();
  }
  function payslipUrl(it: Item) {
    return `${typeof window !== "undefined" ? window.location.origin : ""}/payslip/${it.share_token}`;
  }
  async function copyPayslip(it: Item) {
    try {
      await navigator.clipboard.writeText(payslipUrl(it));
      toast.push("Payslip link copied", "success");
    } catch {
      toast.push(payslipUrl(it), "success");
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={run.label}
      description={`${fmtDate(run.period_start)} – ${fmtDate(run.period_end)} · pay ${fmtDate(run.pay_date)} · ${run.status}`}
      size="lg"
      footer={
        editable ? (
          <div className="flex flex-wrap items-center gap-2 w-full">
            <Button variant="dangerGhost" onClick={deleteDraft} disabled={busy}>Delete draft</Button>
            <span className="text-xs text-inkSoft">Add people from the Timesheet tab.</span>
            <div className="ml-auto">
              <Button onClick={approve} disabled={busy || total <= 0}><CheckCircle2 className="w-4 h-4" /> Approve · {peso.format(total)}</Button>
            </div>
          </div>
        ) : run.status === "approved" ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-sm text-inkSoft">Approved · {peso.format(run.total_amount ?? total)} posted to expenses</span>
            <div className="ml-auto flex gap-2">
              <Button variant="dangerGhost" onClick={voidRun} disabled={busy}><XCircle className="w-4 h-4" /> Void run</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={onClose}>Close</Button>
        )
      }
    >
      {editable ? (
        <div className="flex items-center justify-end gap-2 mb-2 text-xs">
          <span className="text-inkSoft">Set Pay-from for all:</span>
          <Select value="" onChange={(e) => setAllAccounts(e.target.value)} className="w-40" disabled={busy}>
            <option value="">— choose —</option>
            {accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </Select>
        </div>
      ) : null}

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead className="text-inkSoft">
            <tr className="border-b border-border">
              <th className="text-left font-semibold px-2 py-1.5">Name</th>
              <th className="text-left font-semibold px-2 py-1.5">Pay from</th>
              <th className="text-right font-semibold px-2 py-1.5">Amount</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-6 text-center text-inkSoft">No lines. Add people from the Timesheet tab.</td></tr>
            ) : rows.map((it) => {
              const isFixed = it.pay_type === "fixed";
              const days = dayCount(it);
              return (
                <tr key={it.id}>
                  <td className="px-2 py-2 font-medium text-ink">
                    {it.name}
                    {days > 0 ? <span className="ml-1 text-[10px] text-inkSoft">· {days} day{days > 1 ? "s" : ""}</span> : null}
                    {isFixed ? <span className="ml-1 text-[10px] text-inkSoft">· fixed salary</span> : null}
                  </td>
                  <td className="px-2 py-2">
                    {editable ? (
                      <Select value={it.account_code ?? ""} onChange={(e) => saveAccount(it, e.target.value)} className="w-36" disabled={busy}>
                        <option value="">— account —</option>
                        {accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                      </Select>
                    ) : (
                      <span className="text-inkSoft text-xs">{acctName(it.account_code)}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-ink">{peso.format(net(it))}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {editable ? (
                      <span className="inline-flex items-center gap-2">
                        {!isFixed ? (
                          <button onClick={() => onEditTimesheet(it)} className="text-berry hover:underline inline-flex items-center gap-1" title="Open timesheet">
                            <FileText className="w-3.5 h-3.5" /> {days > 0 ? "Timesheet" : "Add timesheet"}
                          </button>
                        ) : null}
                        <button onClick={() => removeLine(it)} className="text-inkSoft hover:text-coral" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                      </span>
                    ) : run.status === "approved" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <a href={payslipUrl(it)} target="_blank" rel="noopener noreferrer" className="text-berry hover:underline inline-flex items-center gap-1" title="Open payslip"><FileText className="w-3.5 h-3.5" /> Payslip</a>
                        <button onClick={() => copyPayslip(it)} className="text-inkSoft hover:text-ink" aria-label="Copy payslip link"><Copy className="w-3.5 h-3.5" /></button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td colSpan={2} className="px-2 py-2 text-right font-semibold text-ink">Total</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums font-bold text-ink">{peso.format(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {run.status === "void" && run.void_reason ? (
        <p className="mt-3 text-xs text-inkSoft">Voided: {run.void_reason}</p>
      ) : null}
    </Modal>
  );
}
