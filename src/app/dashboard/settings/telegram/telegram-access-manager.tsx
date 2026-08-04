"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export type AllowedUser = {
  telegram_user_id: number;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
};

export function TelegramAccessManager({ initial }: { initial: AllowedUser[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [tgId, setTgId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(telegramId: number, displayName: string | null, isActive: boolean) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_telegram_allowed_user", {
      p_telegram_user_id: telegramId,
      p_display_name: displayName,
      p_is_active: isActive,
    });
    if (error) {
      toast.push(error.message || "Couldn't update access", "error");
      return false;
    }
    router.refresh();
    return true;
  }

  async function add() {
    const id = Number(tgId.trim());
    if (!Number.isInteger(id) || id <= 0) {
      toast.push("Enter the numeric Telegram ID the bot replied with.", "error");
      return;
    }
    setBusy(true);
    const ok = await save(id, name.trim() || null, true);
    setBusy(false);
    if (ok) {
      toast.push(`${name.trim() || id} can now use the bot.`, "success");
      setName("");
      setTgId("");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-ink">Expense bot access</h1>
        <p className="text-sm text-inkSoft mt-0.5">
          Who can log expenses by sending the Telegram bot a screenshot. To add someone: have them
          message the bot a screenshot, and it replies with their Telegram ID — enter that below.
        </p>
      </div>

      {/* Add form */}
      <div className="bg-white border border-border rounded-lg shadow-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="tg_name">Name</Label>
            <Input
              id="tg_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hanneh"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tg_id" required>
              Telegram ID
            </Label>
            <Input
              id="tg_id"
              inputMode="numeric"
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="e.g. 2050176524"
              disabled={busy}
            />
          </div>
          <Button onClick={add} disabled={busy}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        {initial.length === 0 ? (
          <div className="p-8 text-center text-sm text-inkSoft">No one added yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {initial.map((u) => (
              <li key={u.telegram_user_id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${u.is_active ? "bg-green" : "bg-border"}`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink font-medium truncate">
                    {u.display_name || "—"}
                  </div>
                  <div className="text-xs text-inkSoft font-mono">
                    ID {u.telegram_user_id} · {u.is_active ? "active" : "off"}
                  </div>
                </div>
                {u.is_active ? (
                  <Button
                    variant="dangerGhost"
                    size="sm"
                    onClick={() => save(u.telegram_user_id, u.display_name, false)}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Turn off
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => save(u.telegram_user_id, u.display_name, true)}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Turn on
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
