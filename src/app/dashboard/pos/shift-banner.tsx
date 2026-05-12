"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CloseShiftDialog } from "./close-shift-dialog";
import type { Role } from "./types";

export function ShiftBanner({
  shiftId,
  staffName,
  eventName,
  openedAtIso,
  txnCount,
  expectedCash,
  viewerRole,
}: {
  shiftId: string;
  staffName: string;
  eventName: string;
  openedAtIso: string;
  txnCount: number;
  expectedCash: number;
  viewerRole: Role;
}) {
  const router = useRouter();
  const toast = useToast();
  const [showForceClose, setShowForceClose] = React.useState(false);
  const [resuming, setResuming] = React.useState(false);

  const canResume = viewerRole === "admin" || viewerRole === "manager";
  const canForceClose = viewerRole === "admin";

  const openedAt = new Date(openedAtIso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleResume() {
    if (resuming) return;
    setResuming(true);
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      setResuming(false);
      toast.push("Not signed in.", "error");
      return;
    }
    const { error } = await supabase
      .from("pos_shifts")
      .update({ staff_user_id: uid })
      .eq("id", shiftId);
    setResuming(false);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    toast.push("Shift claimed", "success");
    router.refresh();
  }

  return (
    <>
      <div className="max-w-2xl mx-auto bg-yellow-50 border border-yellow-300 rounded-lg px-6 py-5 shadow-card">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-bold text-lg text-yellow-900">
              {staffName} has an open shift
            </h2>
            <p className="text-sm text-yellow-900/80 mt-1">
              &ldquo;{eventName || "Untitled shift"}&rdquo; · opened {openedAt} ·{" "}
              {txnCount} txn{txnCount === 1 ? "" : "s"}
            </p>

            {canResume || canForceClose ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {canResume ? (
                  <Button onClick={handleResume} disabled={resuming}>
                    {resuming ? "Claiming…" : "Resume this shift"}
                  </Button>
                ) : null}
                {canForceClose ? (
                  <Button
                    variant="dangerGhost"
                    onClick={() => setShowForceClose(true)}
                  >
                    Force close
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-yellow-900/70 mt-3">
                Wait for {staffName} to close, or ask a manager to take over.
              </p>
            )}
          </div>
        </div>
      </div>

      {canForceClose ? (
        <CloseShiftDialog
          open={showForceClose}
          onClose={() => setShowForceClose(false)}
          shiftId={shiftId}
          expectedCash={expectedCash}
          forceClose
        />
      ) : null}
    </>
  );
}
