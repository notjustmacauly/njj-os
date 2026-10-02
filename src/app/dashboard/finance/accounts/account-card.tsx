"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";
import { accountEmoji } from "../account-icons";

export type AccountCardData = {
  code: string;
  name: string;
  opening_balance: number;
  current_balance: number;
  today_net: number;
  last_activity_at: string | null;
};

function lastActivityLabel(iso: string | null): string {
  if (!iso) return "No activity yet";
  const d = new Date(iso);
  const now = new Date();

  // Compare Manila-day strings — keeps "Today / Yesterday" correct across DST-less PH.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dDate = fmt.format(d);
  const nDate = fmt.format(now);

  const dDay = new Date(`${dDate}T00:00:00+08:00`);
  const nDay = new Date(`${nDate}T00:00:00+08:00`);
  const daysAgo = Math.round((nDay.getTime() - dDay.getTime()) / 86400000);

  const timeStr = d.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  if (daysAgo === 0) return `Today · ${timeStr}`;
  if (daysAgo === 1) return `Yesterday · ${timeStr}`;
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AccountCard({
  data,
  canEditOpening,
}: {
  data: AccountCardData;
  canEditOpening: boolean;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const href = `/dashboard/finance/accounts/${encodeURIComponent(data.code)}`;
  const netTone =
    data.today_net > 0 ? "text-berry" : data.today_net < 0 ? "text-coral" : "text-inkSoft";
  const netLabel =
    data.today_net === 0
      ? "No movement today"
      : `${data.today_net > 0 ? "+" : "−"}${formatPHP(Math.abs(data.today_net))} today`;

  return (
    <>
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden hover:shadow-md transition relative">
        {canEditOpening ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditOpen(true);
            }}
            aria-label={`Set balance for ${data.name}`}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-md text-inkSoft hover:bg-cream hover:text-ink"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <Link href={href} className="block">
          <div className="h-1 bg-berry" />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink mb-1">
              <span aria-hidden className="text-xl leading-none">
                {accountEmoji(data.code)}
              </span>
              <span className="truncate">{data.name}</span>
            </div>
            <div className="font-serif font-bold text-3xl text-berry tabular-nums">
              {formatPHP(data.current_balance)}
            </div>
            <div className={`mt-1 text-xs font-mono ${netTone}`}>{netLabel}</div>
            <div className="mt-1 text-[11px] text-inkSoft">
              {lastActivityLabel(data.last_activity_at)}
            </div>
          </div>
        </Link>
      </div>

      {canEditOpening ? (
        <SetBalanceDialog
          open={editOpen}
          account={data}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </>
  );
}

function SetBalanceDialog({
  open,
  account,
  onClose,
}: {
  open: boolean;
  account: AccountCardData;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = React.useState("");
  const [target, setTarget] = React.useState(String(account.current_balance));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setConfirm("");
      setTarget(String(account.current_balance));
      setError(null);
    }
  }, [open, account.current_balance]);

  const targetNum = Number(target);
  const canSubmit =
    !submitting &&
    confirm.trim().toLowerCase() === account.name.toLowerCase() &&
    Number.isFinite(targetNum) &&
    targetNum >= 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("set_account_current_balance", {
      p_code: account.code,
      p_target: targetNum,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.push(`Balance set for ${account.name}`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={`Set balance — ${account.name}`}
      description="Sets this account's live balance to the amount you enter. Past transactions are kept; future ones move the balance from here. Type the account name to confirm."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} variant="dangerGhost">
            {submitting ? "Saving…" : "Set balance"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-inkSoft">Current live balance</dt>
            <dd className="font-mono">{formatPHP(account.current_balance)}</dd>
          </div>
        </dl>

        <div className="space-y-1">
          <Label htmlFor="target_balance" required>
            Set balance to
          </Label>
          <NumberInput
            id="target_balance"
            prefix="₱"
            min="0"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <p className="text-xs text-inkSoft">
            The card will show exactly this amount. It&rsquo;s reconciled against recorded
            transactions, so logging or voiding entries later still adjusts it correctly.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="confirm_name" required>
            Type <span className="font-mono font-semibold">{account.name}</span> to confirm
          </Label>
          <Input
            id="confirm_name"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={account.name}
            disabled={submitting}
          />
        </div>

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
