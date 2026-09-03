"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";

export type TeamRow = {
  user_id: string;
  display_name: string;
  phone: string | null;
  photo_url: string | null;
  hire_date: string | null;
  status: "active" | "inactive" | "on_leave";
  notes: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  role: Role;
  email: string | null;
  last_sign_in_at: string | null;
};

const ROLE_BADGE: Record<Role, string> = {
  owner: "bg-berryBg text-berry",
  partner: "bg-salmonBg text-coral",
  manager: "bg-cream text-ink border border-border",
  staff: "bg-creamDk text-inkSoft",
  marketing: "bg-periBg text-peri",
};

const ROLE_AVATAR: Record<Role, string> = {
  owner: "bg-berryBg text-berry",
  partner: "bg-salmonBg text-coral",
  manager: "bg-cream text-ink",
  staff: "bg-creamDk text-inkSoft",
  marketing: "bg-periBg text-peri",
};

const STATUS_BADGE: Record<TeamRow["status"], { tone: string; label: string }> = {
  active: { tone: "bg-greenBg text-green", label: "Active" },
  inactive: { tone: "bg-creamDk text-inkSoft", label: "Inactive" },
  on_leave: { tone: "bg-yellowBg text-yellow", label: "On leave" },
};

const SUPABASE_USERS_URL =
  "https://supabase.com/dashboard/project/hatqqguxdezdhlocffqc/auth/users";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

function relativeStamp(iso: string | null): string {
  if (!iso) return "Never signed in";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) {
    return `Today · ${d.toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TeamPage({
  members,
  canEdit,
  adminApiAvailable,
}: {
  members: TeamRow[];
  canEdit: boolean;
  adminApiAvailable: boolean;
}) {
  const activeCount = members.filter((m) => m.status === "active").length;
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TeamRow | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
            <Users className="w-7 h-7 text-berry" />
            Team
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            {activeCount} active member{activeCount === 1 ? "" : "s"}
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Invite member
          </Button>
        ) : null}
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        {members.length === 0 ? (
          <p className="px-5 py-8 text-sm text-inkSoft text-center">
            No team members yet. Invite someone via the Supabase dashboard.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const status = STATUS_BADGE[m.status] ?? STATUS_BADGE.active;
              return (
                <li key={m.user_id}>
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="w-full px-5 py-4 flex items-center gap-4 hover:bg-cream/40 transition text-left"
                  >
                    {m.photo_url ? (
                      // Plain <img> by design — photo_url is a user-pasted URL
                      // and Next/Image domain config isn't worth the friction.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photo_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-border"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0",
                          ROLE_AVATAR[m.role] ?? ROLE_AVATAR.staff,
                        )}
                      >
                        {initialsOf(m.display_name)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink truncate">
                        {m.display_name}
                      </div>
                      <div className="text-xs text-inkSoft truncate inline-flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        {m.email ?? "—"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                        ROLE_BADGE[m.role] ?? ROLE_BADGE.staff,
                      )}
                    >
                      {m.role}
                    </span>
                    <div className="hidden sm:block text-xs text-inkSoft whitespace-nowrap">
                      {relativeStamp(m.last_sign_in_at)}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                        status.tone,
                      )}
                    >
                      {status.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!adminApiAvailable ? (
        <p className="text-[11px] text-inkSoft px-1">
          Note: <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> isn&rsquo;t set on
          this deploy, so emails and last-sign-in timestamps aren&rsquo;t available. Set it in
          Netlify env to enable.
        </p>
      ) : null}

      <InviteMemberModal
        open={inviteOpen}
        adminApiAvailable={adminApiAvailable}
        onClose={() => setInviteOpen(false)}
      />

      {editing ? (
        <MemberDetailModal
          member={editing}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

const INVITE_ROLES: Array<{ value: Role; label: string }> = [
  { value: "marketing", label: "Marketing (restricted — tasks/calendar/time-in only)" },
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager / Ops" },
  { value: "partner", label: "Partner" },
  { value: "owner", label: "Owner" },
];

function InviteMemberModal({
  open,
  adminApiAvailable,
  onClose,
}: {
  open: boolean;
  adminApiAvailable: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [role, setRole] = React.useState<Role>("staff");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setDisplayName("");
      setRole("staff");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!email.includes("@")) return setError("Enter a valid email.");
    if (!displayName.trim()) return setError("Enter a display name.");
    setSubmitting(true);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), displayName: displayName.trim(), role }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string };
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Invite failed.");
      return;
    }
    toast.push(`Invite sent to ${json.email}`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Invite a team member"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !adminApiAvailable}>
            {submitting ? "Sending…" : "Send invite"}
          </Button>
        </>
      }
    >
      {!adminApiAvailable ? (
        <div className="text-sm text-ink space-y-2">
          <p>
            In-app invites need <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> set in
            Netlify env (then redeploy). Until then, invite from the{" "}
            <Link href={SUPABASE_USERS_URL} target="_blank" rel="noopener noreferrer" className="text-berry underline">
              Supabase dashboard
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="inv_email" required>Email</Label>
            <Input id="inv_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv_name" required>Display name</Label>
            <Input id="inv_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv_role" required>Role</Label>
            <Select id="inv_role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={submitting}>
              {INVITE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-inkSoft">
            They&rsquo;ll get an email with a link to set their password, then land in the app with this role — no Supabase dashboard needed.
          </p>
          {error ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">{error}</p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function MemberDetailModal({
  member,
  canEdit,
  onClose,
}: {
  member: TeamRow;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [displayName, setDisplayName] = React.useState(member.display_name);
  const [phone, setPhone] = React.useState(member.phone ?? "");
  const [photoUrl, setPhotoUrl] = React.useState(member.photo_url ?? "");
  const [hireDate, setHireDate] = React.useState(member.hire_date ?? "");
  const [status, setStatus] = React.useState<TeamRow["status"]>(member.status);
  const [notes, setNotes] = React.useState(member.notes ?? "");
  const [bankName, setBankName] = React.useState(member.bank_name ?? "");
  const [accountNumber, setAccountNumber] = React.useState(member.account_number ?? "");
  const [accountName, setAccountName] = React.useState(member.account_name ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [linkBusy, setLinkBusy] = React.useState(false);
  const [tempCred, setTempCred] = React.useState<{ email: string | null; password: string } | null>(null);

  async function setTempPassword() {
    if (linkBusy) return;
    setLinkBusy(true);
    setTempCred(null);
    const res = await fetch("/api/team/setup-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: member.user_id }),
    });
    const json = (await res.json().catch(() => ({}))) as { tempPassword?: string; email?: string | null; error?: string };
    setLinkBusy(false);
    if (!res.ok || !json.tempPassword) {
      toast.push(json.error ?? "Couldn't set a password.", "error");
      return;
    }
    setTempCred({ email: json.email ?? null, password: json.tempPassword });
  }

  React.useEffect(() => {
    setDisplayName(member.display_name);
    setPhone(member.phone ?? "");
    setPhotoUrl(member.photo_url ?? "");
    setHireDate(member.hire_date ?? "");
    setStatus(member.status);
    setNotes(member.notes ?? "");
    setBankName(member.bank_name ?? "");
    setAccountNumber(member.account_number ?? "");
    setAccountName(member.account_name ?? "");
    setError(null);
  }, [member]);

  const dirty =
    displayName !== member.display_name ||
    phone !== (member.phone ?? "") ||
    photoUrl !== (member.photo_url ?? "") ||
    hireDate !== (member.hire_date ?? "") ||
    status !== member.status ||
    notes !== (member.notes ?? "") ||
    bankName !== (member.bank_name ?? "") ||
    accountNumber !== (member.account_number ?? "") ||
    accountName !== (member.account_name ?? "");

  async function handleSave() {
    if (submitting || !dirty) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("team_members")
      .update({
        display_name: displayName.trim(),
        phone: phone.trim() || null,
        photo_url: photoUrl.trim() || null,
        hire_date: hireDate || null,
        status,
        notes: notes.trim() || null,
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        account_name: accountName.trim() || null,
      })
      .eq("user_id", member.user_id);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.push("Team member updated", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={member.display_name}
      description={`Role: ${member.role} · ${member.email ?? "no email on file"}`}
      size="md"
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={submitting || !dirty}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {canEdit ? (
          tempCred ? (
            <div className="rounded-lg border border-green/40 bg-greenBg/50 p-3 space-y-2">
              <div className="text-xs font-semibold text-green">
                Temporary password set — send these to {tempCred.email ?? "them"}:
              </div>
              <div className="text-sm space-y-0.5">
                <div>
                  <span className="text-inkSoft">Email:</span>{" "}
                  <span className="font-mono">{tempCred.email ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-inkSoft">Password:</span>
                  <span className="font-mono font-semibold">{tempCred.password}</span>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard?.writeText(`Email: ${tempCred.email}\nPassword: ${tempCred.password}`)
                    }
                    className="text-xs text-berry hover:underline"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-inkSoft">
                They sign in at <span className="font-mono">njj-os.netlify.app/login</span> with this, then can
                change it any time at <span className="font-mono">/auth/set-password</span>.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-cream/30 p-3 flex items-center justify-between gap-3">
              <div className="text-xs text-inkSoft">
                Onboarding or locked out? Set a temporary password to share — no email needed.
              </div>
              <Button variant="ghost" onClick={setTempPassword} disabled={linkBusy}>
                {linkBusy ? "…" : "Set temporary password"}
              </Button>
            </div>
          )
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="tm_display_name" required={canEdit}>
            Display name
          </Label>
          {canEdit ? (
            <Input
              id="tm_display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
            />
          ) : (
            <p className="text-sm text-ink">{member.display_name}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tm_phone">Phone</Label>
            {canEdit ? (
              <Input
                id="tm_phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
              />
            ) : (
              <p className="text-sm text-ink">{member.phone ?? "—"}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm_hire">Hire date</Label>
            {canEdit ? (
              <DateInput
                id="tm_hire"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                disabled={submitting}
              />
            ) : (
              <p className="text-sm text-ink">{member.hire_date ?? "—"}</p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tm_photo">Photo URL</Label>
          {canEdit ? (
            <Input
              id="tm_photo"
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://…"
              disabled={submitting}
            />
          ) : (
            <p className="text-sm text-ink truncate">{member.photo_url ?? "—"}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="tm_status">Status</Label>
          {canEdit ? (
            <Select
              id="tm_status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TeamRow["status"])}
              disabled={submitting}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </Select>
          ) : (
            <p className="text-sm text-ink capitalize">{member.status.replace("_", " ")}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="tm_notes">Notes</Label>
          {canEdit ? (
            <Textarea
              id="tm_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              rows={3}
            />
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap">{member.notes ?? "—"}</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-cream/30 p-4">
          <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
            Payout account (for reimbursements)
          </span>
          {canEdit ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tm_bank">Bank</Label>
                <Input id="tm_bank" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tm_acctno">Account number</Label>
                <Input id="tm_acctno" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tm_acctname">Account name</Label>
                <Input id="tm_acctname" value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={submitting} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink font-mono">
              {[member.bank_name, member.account_number, member.account_name].filter(Boolean).join(" · ") || "—"}
            </p>
          )}
        </div>

        {canEdit ? (
          <p className="text-[11px] text-inkSoft">
            To change this person&rsquo;s role, use the Supabase SQL editor (
            <code className="font-mono">update public.user_roles set role = &apos;…&apos;</code>).
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
