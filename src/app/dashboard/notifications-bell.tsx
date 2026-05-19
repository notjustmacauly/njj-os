"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";

type Notification = {
  id: string;
  occurred_at: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
};

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * In-app notifications bell. Visible to owner + partner — the
 * payment-submission trigger only writes notifications for those roles.
 * Subscribes to inserts via Supabase realtime and refetches on change.
 */
export function NotificationsBell({ role }: { role: Role }) {
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>([]);
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const refetch = React.useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, occurred_at, type, title, message, link")
      .or(`recipient_user_id.eq.${user.id},recipient_role.eq.${role}`)
      .is("read_at", null)
      .is("dismissed_at", null)
      .order("occurred_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notification[]);
  }, [role]);

  React.useEffect(() => {
    refetch();
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${role}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, role]);

  // Close the panel on outside click + Escape.
  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: Notification) {
    const supabase = createClient();
    await supabase.rpc("mark_notifications_read", { p_ids: [n.id] });
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    if (items.length === 0) return;
    const supabase = createClient();
    await supabase.rpc("mark_notifications_read", { p_ids: items.map((n) => n.id) });
    setItems([]);
  }

  const count = items.length;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-inkSoft hover:bg-cream hover:text-ink transition"
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
      >
        <span className="relative inline-flex">
          <Bell className="w-4 h-4" />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 bg-coral text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center"
            >
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </span>
        Notifications
        {count > 0 ? (
          <span className="text-[10px] uppercase tracking-smallcaps text-coral font-semibold ml-auto">
            new
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-border rounded-lg shadow-xl z-30 max-h-[60vh] flex flex-col">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
              Notifications
            </span>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-berry hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-inkSoft">
              All caught up.
            </p>
          ) : (
            <ul className="overflow-y-auto divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-cream/40 transition",
                    )}
                  >
                    <div className="text-sm font-semibold text-ink">{n.title}</div>
                    {n.message ? (
                      <div className="text-xs text-inkSoft mt-0.5 line-clamp-2">
                        {n.message}
                      </div>
                    ) : null}
                    <div className="text-[10px] text-inkSoft mt-1 font-mono">
                      {formatStamp(n.occurred_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
