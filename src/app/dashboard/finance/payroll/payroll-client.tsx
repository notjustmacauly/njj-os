"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
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
};
export type PayMember = {
  user_id: string;
  display_name: string;
  title: string | null;
  pay_type: string | null;
  pay_rate: number | null;
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
  const [showNew, setShowNew] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [openRun, setOpenRun] = React.useState<Run | null>(null);

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
          <Button onClick={() => setShowNew(true)} disabled={onPayrollCount === 0}>
            <Plus className="w-4 h-4" /> New run
          </Button>
        </div>
      </div>

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
        />
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
  const [saving, setSaving] = React.useState(false);
  const dirty = (member.pay_type ?? "") !== payType || String(member.pay_rate ?? "") !== rate;

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_member_pay", {
      p_user_id: member.user_id,
      p_pay_type: payType || null,
      p_pay_rate: payType && payType !== "manual" && rate ? Number(rate) : null,
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
type Draft = { hours: string; base: string; adj: string; note: string };

function RunModal({
  run,
  items,
  accounts,
  onClose,
  onChanged,
}: {
  run: Run;
  items: Item[];
  accounts: Array<{ code: string; name: string }>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const editable = run.status === "draft";
  const [rows, setRows] = React.useState<Item[]>(items);
  const [draft, setDraft] = React.useState<Record<string, Draft>>(() =>
    Object.fromEntries(items.map((it) => [it.id, {
      hours: String(it.hours), base: String(it.base_amount), adj: String(it.adjustment), note: it.adjust_note ?? "",
    }])),
  );
  const [account, setAccount] = React.useState(accounts[0]?.code ?? "");
  const [busy, setBusy] = React.useState(false);

  const netOf = (it: Item) => {
    const d = draft[it.id];
    if (!d) return Number(it.net_amount);
    return (Number(d.base) || 0) + (Number(d.adj) || 0);
  };
  const total = rows.reduce((s, it) => s + netOf(it), 0);

  function setField(id: string, k: keyof Draft, v: string) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  }

  async function saveChanges(): Promise<boolean> {
    setBusy(true);
    const supabase = createClient();
    for (const it of rows) {
      const d = draft[it.id];
      if (!d) continue;
      const changed = String(it.hours) !== d.hours || String(it.base_amount) !== d.base ||
        String(it.adjustment) !== d.adj || (it.adjust_note ?? "") !== d.note;
      if (!changed) continue;
      const { error } = await supabase.rpc("update_payroll_item", {
        p_item_id: it.id,
        p_hours: Number(d.hours) || 0,
        p_base_amount: Number(d.base) || 0,
        p_adjustment: Number(d.adj) || 0,
        p_adjust_note: d.note.trim() || null,
      });
      if (error) { setBusy(false); toast.push(error.message, "error"); return false; }
    }
    setBusy(false);
    return true;
  }

  async function addLine() {
    const name = prompt("Name for the extra line?");
    if (!name || !name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_payroll_item", {
      p_run_id: run.id, p_name: name.trim(), p_base_amount: 0, p_adjustment: 0, p_adjust_note: null,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    onChanged();
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
    if (!account) return toast.push("Pick the paying account.", "error");
    const ok = await saveChanges();
    if (!ok) return;
    if (!confirm(`Approve payroll of ${peso.format(total)}? This posts one expense from ${accounts.find((a) => a.code === account)?.name ?? account} and cannot be edited after.`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_payroll_run", { p_run_id: run.id, p_account_code: account });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Payroll approved · expense posted", "success");
    onChanged();
  }
  async function voidRun() {
    const reason = prompt("Reason for voiding this run? (the expense will be reversed)");
    if (reason === null) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("void_payroll_run", { p_run_id: run.id, p_reason: reason });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Run voided · expense reversed", "success");
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

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={run.label}
      description={`${fmtDate(run.period_start)} – ${fmtDate(run.period_end)} · pay ${fmtDate(run.pay_date)} · ${run.status}`}
      size="xl"
      footer={
        editable ? (
          <div className="flex flex-wrap items-center gap-2 w-full">
            <Button variant="dangerGhost" onClick={deleteDraft} disabled={busy}>Delete draft</Button>
            <Button variant="ghost" onClick={addLine} disabled={busy}><Plus className="w-4 h-4" /> Add line</Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={() => saveChanges().then((ok) => ok && (toast.push("Saved", "success"), onChanged()))} disabled={busy}>Save</Button>
              <Select value={account} onChange={(e) => setAccount(e.target.value)} disabled={busy} className="w-40">
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
              <Button onClick={approve} disabled={busy || total <= 0}><CheckCircle2 className="w-4 h-4" /> Approve · {peso.format(total)}</Button>
            </div>
          </div>
        ) : run.status === "approved" ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-sm text-inkSoft">Posted to {accounts.find((a) => a.code === run.account_code)?.name ?? run.account_code}</span>
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
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead className="text-inkSoft">
            <tr className="border-b border-border">
              <th className="text-left font-semibold px-2 py-1.5">Name</th>
              <th className="text-left font-semibold px-2 py-1.5">Type</th>
              <th className="text-right font-semibold px-2 py-1.5">Hours</th>
              <th className="text-right font-semibold px-2 py-1.5">Base ₱</th>
              <th className="text-right font-semibold px-2 py-1.5">Adjust ₱</th>
              <th className="text-left font-semibold px-2 py-1.5">Note</th>
              <th className="text-right font-semibold px-2 py-1.5">Net</th>
              {editable ? <th className="px-2 py-1.5"></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={editable ? 8 : 7} className="px-2 py-6 text-center text-inkSoft">No lines.</td></tr>
            ) : rows.map((it) => {
              const d = draft[it.id];
              return (
                <tr key={it.id}>
                  <td className="px-2 py-1.5 font-medium text-ink">{it.name}</td>
                  <td className="px-2 py-1.5 text-inkSoft">{PAY_TYPE_LABEL[it.pay_type] ?? it.pay_type}</td>
                  <td className="px-2 py-1.5 text-right">
                    {editable && it.pay_type === "hourly" ? (
                      <NumberInput min="0" step="0.01" value={d?.hours ?? ""} onChange={(e) => setField(it.id, "hours", e.target.value)} className="w-20 text-right" />
                    ) : (
                      <span className="tabular-nums text-inkSoft">{it.pay_type === "hourly" ? Number(it.hours).toFixed(2) : "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {editable ? (
                      <NumberInput min="0" step="0.01" value={d?.base ?? ""} onChange={(e) => setField(it.id, "base", e.target.value)} className="w-24 text-right" />
                    ) : (
                      <span className="tabular-nums">{peso.format(Number(it.base_amount))}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {editable ? (
                      <NumberInput step="0.01" value={d?.adj ?? ""} onChange={(e) => setField(it.id, "adj", e.target.value)} className="w-24 text-right" />
                    ) : (
                      <span className="tabular-nums text-inkSoft">{Number(it.adjustment) ? peso.format(Number(it.adjustment)) : "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {editable ? (
                      <Input value={d?.note ?? ""} onChange={(e) => setField(it.id, "note", e.target.value)} placeholder="bonus / advance…" className="w-40" />
                    ) : (
                      <span className="text-inkSoft text-xs">{it.adjust_note ?? ""}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-ink">{peso.format(netOf(it))}</td>
                  {editable ? (
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => removeLine(it)} className="text-inkSoft hover:text-coral" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td colSpan={editable ? 6 : 6} className="px-2 py-2 text-right font-semibold text-ink">Total</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums font-bold text-ink">{peso.format(total)}</td>
              {editable ? <td></td> : null}
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
