"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Shield, Wallet, User as UserIcon, Clock, IdCard, ClipboardList, Trash2, Plus, ListChecks, HandCoins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";

export type Payslip = { token: string; amount: number; label: string; pay_date: string };
export type Hours = { month_minutes: number; total_minutes: number; shifts: number; last_shift: string | null };
export type TaskStats = { open: number; completed: number; completed_dated: number; ontime: number; overdue_open: number };
export type Incident = {
  id: string;
  user_id: string | null;
  person_id?: string | null;
  kind: "incident" | "concern" | "performance" | "commendation" | "note";
  title: string;
  details: string | null;
  occurred_on: string;
  severity: "low" | "medium" | "high" | null;
};
export type Profile = {
  user_id: string;
  display_name: string;
  title: string | null;
  phone: string | null;
  photo_url: string | null;
  hire_date: string | null;
  status: string;
  notes: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  payslip_email: string | null;
  sss_no: string | null;
  philhealth_no: string | null;
  tin_no: string | null;
  pagibig_no: string | null;
  pay_type: string | null;
  pay_rate: number | null;
  unpaid_break_min: number | null;
  hide_expense_amounts: boolean;
  attendance_supervisor: boolean;
  email: string | null;
  role: Role;
  payslips: Payslip[];
  hours: Hours | null;
  incidents: Incident[];
  taskStats: TaskStats | null;
};

export type Advance = { id: string; principal: number; balance: number; installment: number; advance_date: string; status: string };
export type OffPerson = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  hire_date: string | null;
  active: boolean;
  notes: string | null;
  email: string | null;
  pay_type: string;
  default_amount: number;
  default_rate: number | null;
  sss_no: string | null;
  philhealth_no: string | null;
  tin_no: string | null;
  pagibig_no: string | null;
  payslips: Payslip[];
  incidents: Incident[];
  advances: Advance[];
};

const ROLE_OPTIONS: Role[] = ["owner", "partner", "manager", "staff", "marketing"];
const STATUS_OPTIONS = ["active", "on_leave", "inactive"];
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const ROLE_TONE: Record<string, string> = {
  owner: "bg-berryBg text-berry",
  partner: "bg-periBg text-peri",
  manager: "bg-greenBg text-green",
  staff: "bg-yellowBg text-yellow",
  marketing: "bg-salmonBg text-coral",
};
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function hoursFmt(min: number): string {
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}
const KIND_TONE: Record<string, string> = {
  incident: "bg-salmonBg text-coral",
  concern: "bg-yellowBg text-yellow",
  performance: "bg-periBg text-peri",
  commendation: "bg-greenBg text-green",
  note: "bg-creamDk text-inkSoft",
};
const KIND_OPTIONS = ["note", "concern", "incident", "performance", "commendation"] as const;

export function TeamProfilesClient({ profiles, offPeople = [], adminAvailable }: { profiles: Profile[]; offPeople?: OffPerson[]; adminAvailable: boolean }) {
  const [open, setOpen] = React.useState<Profile | null>(null);
  const [openOff, setOpenOff] = React.useState<OffPerson | null>(null);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-ink">Team</h1>
        <p className="text-sm text-inkSoft mt-1">Profiles, access, pay and payslips — owner only.</p>
      </div>

      {!adminAvailable ? (
        <div className="bg-yellowBg border border-yellow/40 text-yellow rounded-md px-3 py-2 text-sm">
          Emails are hidden — the service-role key isn&rsquo;t set in Netlify. Everything else works.
        </div>
      ) : null}

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Name</th>
              <th className="text-left font-semibold px-4 py-2">Email</th>
              <th className="text-left font-semibold px-4 py-2">Role</th>
              <th className="text-left font-semibold px-4 py-2">Status</th>
              <th className="text-right font-semibold px-4 py-2">Payslips</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {profiles.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-inkSoft">No team members.</td></tr>
            ) : profiles.map((p) => (
              <tr key={p.user_id} className="hover:bg-cream/40 cursor-pointer" onClick={() => setOpen(p)}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-cream flex items-center justify-center text-xs font-bold text-inkSoft overflow-hidden">
                      {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" /> : initials(p.display_name)}
                    </span>
                    <div>
                      <div className="font-medium text-ink">{p.display_name}</div>
                      {p.title ? <div className="text-[11px] text-inkSoft">{p.title}</div> : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-inkSoft">{p.email ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", ROLE_TONE[p.role] ?? ROLE_TONE.staff)}>{p.role}</span>
                </td>
                <td className="px-4 py-2.5 text-inkSoft capitalize">{p.status.replace("_", " ")}</td>
                <td className="px-4 py-2.5 text-right text-inkSoft">{p.payslips.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Production / off-system staff — paper timekeeping, no login. */}
      <div>
        <h2 className="font-serif font-bold text-xl text-ink">Production &amp; off-system staff</h2>
        <p className="text-sm text-inkSoft mt-1 mb-3">Paper timekeeping, no login. Their HR file, gov IDs, payslips, and cash advances live here.</p>
        <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Title</th>
                <th className="text-left font-semibold px-4 py-2">Status</th>
                <th className="text-right font-semibold px-4 py-2">Advance balance</th>
                <th className="text-right font-semibold px-4 py-2">Payslips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {offPeople.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-inkSoft">No off-system staff yet. Add them in Payroll → Pay setup.</td></tr>
              ) : offPeople.map((p) => {
                const bal = p.advances.filter((a) => a.status === "outstanding").reduce((s, a) => s + Number(a.balance), 0);
                return (
                  <tr key={p.id} className="hover:bg-cream/40 cursor-pointer" onClick={() => setOpenOff(p)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-cream flex items-center justify-center text-xs font-bold text-inkSoft">{initials(p.name)}</span>
                        <div className="font-medium text-ink">{p.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.title ?? "—"}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.active ? "active" : "inactive"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{bal > 0 ? peso.format(bal) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-inkSoft">{p.payslips.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {open ? <ProfileModal p={open} onClose={() => setOpen(null)} /> : null}
      {openOff ? <OffPersonModal p={openOff} onClose={() => setOpenOff(null)} /> : null}
    </div>
  );
}

function OffPersonModal({ p, onClose }: { p: OffPerson; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState(p.title ?? "");
  const [phone, setPhone] = React.useState(p.phone ?? "");
  const [hireDate, setHireDate] = React.useState(p.hire_date ?? "");
  const [sss, setSss] = React.useState(p.sss_no ?? "");
  const [philhealth, setPhilhealth] = React.useState(p.philhealth_no ?? "");
  const [tin, setTin] = React.useState(p.tin_no ?? "");
  const [pagibig, setPagibig] = React.useState(p.pagibig_no ?? "");
  const [busy, setBusy] = React.useState(false);

  async function saveProfile() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_payroll_person_profile", {
      p_id: p.id, p_title: title.trim() || null, p_phone: phone.trim() || null,
      p_hire_date: hireDate || null, p_sss_no: sss.trim() || null,
      p_philhealth_no: philhealth.trim() || null, p_tin_no: tin.trim() || null, p_pagibig_no: pagibig.trim() || null,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Profile saved", "success");
    router.refresh();
  }

  const outstanding = p.advances.filter((a) => a.status === "outstanding");

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={p.name} description="Off-system staff · paper timekeeping" size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button><Button onClick={saveProfile} disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button></>}>
      <div className="space-y-6">
        {/* Identity */}
        <section>
          <h3 className="font-serif font-bold text-base text-ink mb-2">Identity &amp; contact</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Title / role</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="e.g. Production staff" /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Hire date</Label><DateInput value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={busy} /></div>
          </div>
          <p className="text-xs text-inkSoft mt-2">Name, pay setup and payslip email are managed in Payroll → Pay setup.</p>
        </section>

        {/* Government IDs */}
        <section>
          <h3 className="font-serif font-bold text-base text-ink mb-2">Government IDs</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>SSS no.</Label><Input value={sss} onChange={(e) => setSss(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>PhilHealth no.</Label><Input value={philhealth} onChange={(e) => setPhilhealth(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>TIN</Label><Input value={tin} onChange={(e) => setTin(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Pag-IBIG no.</Label><Input value={pagibig} onChange={(e) => setPagibig(e.target.value)} disabled={busy} /></div>
          </div>
        </section>

        {/* Cash advances */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><HandCoins className="w-4 h-4" /> Cash advances</h3>
          {p.advances.length === 0 ? (
            <p className="text-sm text-inkSoft">No cash advances. Record one in Payroll → Cash advances.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {p.advances.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-ink">{fmtDate(a.advance_date)} · {peso.format(a.principal)}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-inkSoft">{peso.format(a.balance)} left</span>
                    <span className={cn("text-[11px] font-semibold", a.status === "settled" ? "text-green" : "text-yellow")}>{a.status}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {outstanding.length > 0 ? (
            <p className="text-xs text-inkSoft mt-1">Repayments are deducted on payslips in each pay run.</p>
          ) : null}
        </section>

        {/* Payslips */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><FileText className="w-4 h-4" /> Payslips</h3>
          {p.payslips.length === 0 ? (
            <p className="text-sm text-inkSoft">No payslips yet.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {p.payslips.map((s) => (
                <a key={s.token} href={`/payslip/${s.token}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-3 py-2 text-sm hover:bg-cream/40">
                  <span className="text-ink">{s.label || fmtDate(s.pay_date)}</span>
                  <span className="flex items-center gap-3"><span className="tabular-nums font-mono text-ink">{peso.format(s.amount)}</span><span className="text-berry inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Open</span></span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* HR & incidents */}
        <IncidentsSection personId={p.id} incidents={p.incidents} />
      </div>
    </Modal>
  );
}

function ProfileModal({ p, onClose }: { p: Profile; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [displayName, setDisplayName] = React.useState(p.display_name);
  const [title, setTitle] = React.useState(p.title ?? "");
  const [phone, setPhone] = React.useState(p.phone ?? "");
  const [photoUrl, setPhotoUrl] = React.useState(p.photo_url ?? "");
  const [hireDate, setHireDate] = React.useState(p.hire_date ?? "");
  const [status, setStatus] = React.useState(p.status);
  const [notes, setNotes] = React.useState(p.notes ?? "");
  const [role, setRole] = React.useState<Role>(p.role);
  const [hideAmounts, setHideAmounts] = React.useState(p.hide_expense_amounts);
  const [attnSup, setAttnSup] = React.useState(p.attendance_supervisor);
  const [payType, setPayType] = React.useState(p.pay_type ?? "");
  const [payRate, setPayRate] = React.useState(p.pay_rate != null ? String(p.pay_rate) : "");
  const [brk, setBrk] = React.useState(p.unpaid_break_min != null ? String(p.unpaid_break_min) : "");
  const [bankName, setBankName] = React.useState(p.bank_name ?? "");
  const [accountNumber, setAccountNumber] = React.useState(p.account_number ?? "");
  const [accountName, setAccountName] = React.useState(p.account_name ?? "");
  const [payslipEmail, setPayslipEmail] = React.useState(p.payslip_email ?? "");
  const [sss, setSss] = React.useState(p.sss_no ?? "");
  const [philhealth, setPhilhealth] = React.useState(p.philhealth_no ?? "");
  const [tin, setTin] = React.useState(p.tin_no ?? "");
  const [pagibig, setPagibig] = React.useState(p.pagibig_no ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!displayName.trim()) return toast.push("Name is required.", "error");
    setBusy(true);
    const supabase = createClient();
    const { error: e1 } = await supabase
      .from("team_members")
      .update({
        display_name: displayName.trim(),
        title: title.trim() || null,
        phone: phone.trim() || null,
        photo_url: photoUrl.trim() || null,
        hire_date: hireDate || null,
        status,
        notes: notes.trim() || null,
        payslip_email: payslipEmail.trim() || null,
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        account_name: accountName.trim() || null,
        sss_no: sss.trim() || null,
        philhealth_no: philhealth.trim() || null,
        tin_no: tin.trim() || null,
        pagibig_no: pagibig.trim() || null,
        hide_expense_amounts: hideAmounts,
        attendance_supervisor: attnSup,
      })
      .eq("user_id", p.user_id);
    if (e1) { setBusy(false); return toast.push(e1.message, "error"); }

    if (role !== p.role) {
      const { error: e2 } = await supabase.rpc("set_user_role", { p_user_id: p.user_id, p_role: role });
      if (e2) { setBusy(false); return toast.push(e2.message, "error"); }
    }

    const { error: e3 } = await supabase.rpc("set_member_pay", {
      p_user_id: p.user_id,
      p_pay_type: payType || null,
      p_pay_rate: payType && payType !== "manual" && payRate ? Number(payRate) : null,
      p_break_min: payType === "hourly" && brk ? Math.round(Number(brk)) : 0,
    });
    if (e3) { setBusy(false); return toast.push(e3.message, "error"); }

    setBusy(false);
    toast.push(`Saved ${displayName.trim()}`, "success");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={p.display_name}
      description={p.email ?? "no email on file"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Identity & contact */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><UserIcon className="w-4 h-4" /> Identity &amp; contact</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Job title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ops Manager" disabled={busy} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Hire date</Label><DateInput value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>)}
              </Select>
            </div>
            <div className="space-y-1"><Label>Photo URL</Label><Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="optional link" disabled={busy} /></div>
            <div className="space-y-1">
              <Label>Payslip email</Label>
              <Input type="email" value={payslipEmail} onChange={(e) => setPayslipEmail(e.target.value)} placeholder="private — where payslips are sent" disabled={busy} />
              <p className="text-[11px] text-inkSoft">Payslips send here, not the login email.</p>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>Bio / notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} /></div>
          </div>
        </section>

        {/* Hours worked */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><Clock className="w-4 h-4" /> Hours worked</h3>
          {p.hours && p.hours.shifts > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-cream/60 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">This month</div>
                <div className="text-lg font-bold text-ink tabular-nums">{hoursFmt(p.hours.month_minutes)}</div>
              </div>
              <div className="bg-cream/60 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">All time</div>
                <div className="text-lg font-bold text-ink tabular-nums">{hoursFmt(p.hours.total_minutes)}</div>
                <div className="text-[10px] text-inkSoft">{p.hours.shifts} shift{p.hours.shifts > 1 ? "s" : ""}</div>
              </div>
              <div className="bg-cream/60 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">Last shift</div>
                <div className="text-sm font-semibold text-ink">{p.hours.last_shift ? fmtDate(p.hours.last_shift.slice(0, 10)) : "—"}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-inkSoft">No completed shifts recorded yet.</p>
          )}
        </section>

        {/* Tasks & performance */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><ListChecks className="w-4 h-4" /> Tasks &amp; performance</h3>
          {p.taskStats && (p.taskStats.open + p.taskStats.completed) > 0 ? (
            (() => {
              const s = p.taskStats!;
              const rate = s.completed_dated > 0 ? Math.round((s.ontime / s.completed_dated) * 100) : null;
              const barTone = rate == null ? "bg-inkSoft/30" : rate >= 80 ? "bg-green" : rate >= 50 ? "bg-yellow" : "bg-coral";
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-cream/60 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">Open</div>
                      <div className="text-lg font-bold text-ink tabular-nums">{s.open}{s.overdue_open > 0 ? <span className="text-coral text-xs font-semibold"> · {s.overdue_open} overdue</span> : null}</div>
                    </div>
                    <div className="bg-cream/60 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">Completed</div>
                      <div className="text-lg font-bold text-ink tabular-nums">{s.completed}</div>
                    </div>
                    <div className="bg-cream/60 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">On-time rate</div>
                      <div className="text-lg font-bold text-ink tabular-nums">{rate == null ? "—" : `${rate}%`}</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-inkSoft mb-1">
                      <span>Performance (on-time completion)</span>
                      <span>{rate == null ? "no dated tasks yet" : `${s.ontime}/${s.completed_dated} on time`}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-cream overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${rate ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-inkSoft">No tasks assigned yet.</p>
          )}
        </section>

        {/* Government IDs */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><IdCard className="w-4 h-4" /> Government IDs</h3>
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>SSS</Label><Input value={sss} onChange={(e) => setSss(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>PhilHealth</Label><Input value={philhealth} onChange={(e) => setPhilhealth(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>TIN</Label><Input value={tin} onChange={(e) => setTin(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Pag-IBIG</Label><Input value={pagibig} onChange={(e) => setPagibig(e.target.value)} disabled={busy} /></div>
          </div>
        </section>

        {/* Access & permissions */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><Shield className="w-4 h-4" /> Access &amp; permissions</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Role</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={busy}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </Select>
              <p className="text-[11px] text-inkSoft">Controls what areas they can open.</p>
            </div>
            <div className="space-y-2 pt-5">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={hideAmounts} onChange={(e) => setHideAmounts(e.target.checked)} disabled={busy} />
                Hide expense amounts (confidential salaries)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={attnSup} onChange={(e) => setAttnSup(e.target.checked)} disabled={busy} />
                Attendance supervisor (sees the team&rsquo;s time-in)
              </label>
            </div>
          </div>
        </section>

        {/* Pay */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><Wallet className="w-4 h-4" /> Pay</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label>Pay type</Label>
              <Select value={payType} onChange={(e) => setPayType(e.target.value)} disabled={busy} className="w-36">
                <option value="">Not on payroll</option>
                <option value="hourly">Hourly</option>
                <option value="fixed">Fixed</option>
                <option value="manual">Manual</option>
              </Select>
            </div>
            <div className="space-y-1"><Label>{payType === "hourly" ? "₱/hour" : payType === "fixed" ? "₱/run" : "Rate"}</Label>
              <NumberInput prefix="₱" min="0" step="0.01" value={payRate} onChange={(e) => setPayRate(e.target.value)} disabled={busy || !payType || payType === "manual"} className="w-32" />
            </div>
            {payType === "hourly" ? (
              <div className="space-y-1"><Label>Unpaid break (min/day)</Label>
                <NumberInput min="0" step="15" value={brk} onChange={(e) => setBrk(e.target.value)} placeholder="60" disabled={busy} className="w-28" />
              </div>
            ) : null}
          </div>
        </section>

        {/* Payout details */}
        <section>
          <h3 className="font-serif font-bold text-base text-ink mb-2">Payout details</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Bank / e-wallet</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Account number</Label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label>Account name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={busy} /></div>
          </div>
        </section>

        {/* Payslips */}
        <section>
          <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink mb-2"><FileText className="w-4 h-4" /> Payslips</h3>
          {p.payslips.length === 0 ? (
            <p className="text-sm text-inkSoft">No payslips yet — they appear here once a run they&rsquo;re in is approved.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {p.payslips.map((s) => (
                <a key={s.token} href={`/payslip/${s.token}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-3 py-2 text-sm hover:bg-cream/40">
                  <span className="text-ink">{s.label || fmtDate(s.pay_date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums font-mono text-ink">{peso.format(s.amount)}</span>
                    <span className="text-berry inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Open</span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* HR & incidents */}
        <IncidentsSection userId={p.user_id} incidents={p.incidents} />
      </div>
    </Modal>
  );
}

function IncidentsSection({ userId, personId, incidents }: { userId?: string | null; personId?: string | null; incidents: Incident[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [kind, setKind] = React.useState<Incident["kind"]>("note");
  const [title, setTitle] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [when, setWhen] = React.useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [severity, setSeverity] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!title.trim()) return toast.push("Add a short title.", "error");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_hr_incident", {
      p_user_id: userId ?? null, p_person_id: personId ?? null, p_kind: kind, p_title: title.trim(),
      p_details: details.trim() || null, p_occurred_on: when || null, p_severity: severity || null,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    setKind("note"); setTitle(""); setDetails(""); setSeverity(""); setAdding(false);
    toast.push("Logged", "success");
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_hr_incident", { p_id: id });
    if (error) return toast.push(error.message, "error");
    router.refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-1.5 font-serif font-bold text-base text-ink"><ClipboardList className="w-4 h-4" /> HR &amp; incidents</h3>
        {!adding ? <Button variant="ghost" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Log entry</Button> : null}
      </div>

      {adding ? (
        <div className="border border-berry/40 rounded-lg p-3 mb-3 space-y-2">
          <div className="grid sm:grid-cols-4 gap-2">
            <div className="space-y-1"><Label className="text-[10px]">Type</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as Incident["kind"])} disabled={busy}>
                {KIND_OPTIONS.map((k) => <option key={k} value={k} className="capitalize">{k}</option>)}
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label className="text-[10px]">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Late 3x this week" disabled={busy} />
            </div>
            <div className="space-y-1"><Label className="text-[10px]">Date</Label>
              <DateInput value={when} onChange={(e) => setWhen(e.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="grid sm:grid-cols-4 gap-2">
            <div className="space-y-1"><Label className="text-[10px]">Severity</Label>
              <Select value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={busy}>
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-3"><Label className="text-[10px]">Details</Label>
              <Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="what happened / context" disabled={busy} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={add} disabled={busy || !title.trim()}>{busy ? "…" : "Save entry"}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {incidents.length === 0 ? (
        <p className="text-sm text-inkSoft">No entries. Log incidents, concerns, performance notes or commendations here.</p>
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <div key={i.id} className="flex items-start gap-2 border border-border rounded-lg px-3 py-2 group">
              <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", KIND_TONE[i.kind])}>{i.kind}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">{i.title}
                  {i.severity ? <span className={cn("ml-2 text-[10px] font-semibold uppercase", i.severity === "high" ? "text-coral" : i.severity === "medium" ? "text-yellow" : "text-inkSoft")}>{i.severity}</span> : null}
                </div>
                {i.details ? <div className="text-xs text-inkSoft mt-0.5">{i.details}</div> : null}
                <div className="text-[10px] text-inkSoft mt-0.5">{fmtDate(i.occurred_on)}</div>
              </div>
              <button onClick={() => remove(i.id)} className="opacity-0 group-hover:opacity-100 text-inkSoft hover:text-coral transition" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
