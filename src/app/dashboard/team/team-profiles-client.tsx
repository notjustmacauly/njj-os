"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Shield, Wallet, User as UserIcon } from "lucide-react";
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
  pay_type: string | null;
  pay_rate: number | null;
  unpaid_break_min: number | null;
  hide_expense_amounts: boolean;
  attendance_supervisor: boolean;
  email: string | null;
  role: Role;
  payslips: Payslip[];
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

export function TeamProfilesClient({ profiles, adminAvailable }: { profiles: Profile[]; adminAvailable: boolean }) {
  const [open, setOpen] = React.useState<Profile | null>(null);
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

      {open ? <ProfileModal p={open} onClose={() => setOpen(null)} /> : null}
    </div>
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
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        account_name: accountName.trim() || null,
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
            <div className="space-y-1 sm:col-span-2"><Label>Bio / notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} /></div>
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
      </div>
    </Modal>
  );
}
