"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Mail, UserPlus, Users } from "lucide-react";
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
  role: Role;
  email: string | null;
  last_sign_in_at: string | null;
};

const ROLE_BADGE: Record<Role, string> = {
  owner: "bg-berryBg text-berry",
  partner: "bg-salmonBg text-coral",
  manager: "bg-cream text-ink border border-border",
  staff: "bg-creamDk text-inkSoft",
};

const ROLE_AVATAR: Record<Role, string> = {
  owner: "bg-berryBg text-berry",
  partner: "bg-salmonBg text-coral",
  manager: "bg-cream text-ink",
  staff: "bg-creamDk text-inkSoft",
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
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4" />
          Invite member
        </Button>
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

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

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

function InviteMemberModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a new team member"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Link
            href={SUPABASE_USERS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-berry text-white font-semibold text-sm hover:bg-berry/90 transition"
          >
            <ExternalLink className="w-4 h-4" />
            Open Supabase dashboard
          </Link>
        </>
      }
    >
      <div className="text-sm text-ink space-y-3">
        <ol className="list-decimal list-outside ml-5 space-y-2">
          <li>
            Open Supabase dashboard → Authentication → Users → <strong>Add user</strong> →{" "}
            <strong>Send invitation</strong>.
          </li>
          <li>Enter the new member&rsquo;s email. They&rsquo;ll receive a sign-up link.</li>
          <li>
            After they accept, run two SQL snippets in the Supabase SQL editor (replace
            <code className="font-mono mx-1">THEIR_AUTH_USER_ID</code> with their real id):
          </li>
        </ol>
        <pre className="bg-cream rounded-md px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
{`insert into public.user_roles (user_id, role)
  values ('THEIR_AUTH_USER_ID', 'manager');   -- pick role

insert into public.team_members (user_id, display_name)
  values ('THEIR_AUTH_USER_ID', 'Display Name');`}
        </pre>
        <p className="text-xs text-inkSoft">
          Refresh this page after the SQL runs — the new member will appear in the list.
        </p>
      </div>
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
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDisplayName(member.display_name);
    setPhone(member.phone ?? "");
    setPhotoUrl(member.photo_url ?? "");
    setHireDate(member.hire_date ?? "");
    setStatus(member.status);
    setNotes(member.notes ?? "");
    setError(null);
  }, [member]);

  const dirty =
    displayName !== member.display_name ||
    phone !== (member.phone ?? "") ||
    photoUrl !== (member.photo_url ?? "") ||
    hireDate !== (member.hire_date ?? "") ||
    status !== member.status ||
    notes !== (member.notes ?? "");

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
