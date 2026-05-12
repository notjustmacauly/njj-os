"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { BatchOption } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OpenShiftForm({
  defaultStaffName,
  recentEventNames,
  batchesBySku,
}: {
  defaultStaffName: string;
  recentEventNames: string[];
  batchesBySku: Record<"PCL" | "ACG" | "WPM", BatchOption[]>;
}) {
  const router = useRouter();
  const toast = useToast();

  const [eventName, setEventName] = React.useState("");
  const [eventMode, setEventMode] = React.useState<"pick" | "custom">(
    recentEventNames.length > 0 ? "pick" : "custom",
  );
  const [shiftDate, setShiftDate] = React.useState(todayIso());
  const [staffName, setStaffName] = React.useState(defaultStaffName);
  const [openingCash, setOpeningCash] = React.useState("1000");
  const [batchPcl, setBatchPcl] = React.useState(batchesBySku.PCL[0]?.batch_id ?? "");
  const [batchAcg, setBatchAcg] = React.useState(batchesBySku.ACG[0]?.batch_id ?? "");
  const [batchWpm, setBatchWpm] = React.useState(batchesBySku.WPM[0]?.batch_id ?? "");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (eventMode === "pick" && recentEventNames.length > 0 && !eventName) {
      setEventName(recentEventNames[0]);
    }
  }, [eventMode, recentEventNames, eventName]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedEvent = eventName.trim();
    if (!trimmedEvent) {
      setError("Event name is required.");
      return;
    }
    const cash = Number(openingCash);
    if (!Number.isFinite(cash) || cash < 0) {
      setError("Opening cash must be a non-negative number.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc("open_pos_shift", {
      p_event_name: trimmedEvent,
      p_shift_date: shiftDate,
      p_opening_cash: cash,
      p_staff_name: staffName.trim() || null,
      p_default_batch_pcl: batchPcl || null,
      p_default_batch_acg: batchAcg || null,
      p_default_batch_wpm: batchWpm || null,
      p_notes: notes.trim() || null,
    });
    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      toast.push(rpcErr.message, "error");
      return;
    }
    if (!data) {
      setError("Shift not created.");
      return;
    }
    toast.push("Shift opened", "success");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl mx-auto bg-white border border-border rounded-lg shadow-card overflow-hidden"
    >
      <div className="bg-berryBg/40 px-6 py-5 border-b border-border">
        <h1 className="font-serif font-bold text-2xl text-ink flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-berry" />
          Open a new shift
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Set up before taking the booth.
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">
        <div className="space-y-1">
          <Label htmlFor="event_name" required>
            Event name
          </Label>
          {eventMode === "pick" && recentEventNames.length > 0 ? (
            <div className="flex gap-2">
              <Select
                id="event_name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                disabled={submitting}
                className="flex-1"
              >
                {recentEventNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => {
                  setEventMode("custom");
                  setEventName("");
                }}
                className="text-xs text-berry hover:underline whitespace-nowrap"
              >
                Type new
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                id="event_name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Saturday Market"
                disabled={submitting}
                className="flex-1"
              />
              {recentEventNames.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setEventMode("pick");
                    setEventName(recentEventNames[0]);
                  }}
                  className="text-xs text-berry hover:underline whitespace-nowrap"
                >
                  Pick recent
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="shift_date" required>
              Shift date
            </Label>
            <DateInput
              id="shift_date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="staff_name">Staff name</Label>
            <Input
              id="staff_name"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="opening_cash" required>
            Opening cash float
          </Label>
          <NumberInput
            id="opening_cash"
            prefix="₱"
            min="0"
            step="1"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            disabled={submitting}
          />
        </div>

        <fieldset className="border border-border rounded-md px-4 py-3">
          <legend className="px-1 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
            Default batches (FIFO suggested)
          </legend>
          <div className="space-y-3 mt-1">
            <BatchSelect
              label="PCL 🍍"
              value={batchPcl}
              options={batchesBySku.PCL}
              onChange={setBatchPcl}
              disabled={submitting}
            />
            <BatchSelect
              label="ACG 🥕"
              value={batchAcg}
              options={batchesBySku.ACG}
              onChange={setBatchAcg}
              disabled={submitting}
            />
            <BatchSelect
              label="WPM 🍉"
              value={batchWpm}
              options={batchesBySku.WPM}
              onChange={setBatchWpm}
              disabled={submitting}
            />
          </div>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
          />
        </div>

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>

      <div className="px-6 py-4 bg-cream/40 border-t border-border flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard")}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Opening…" : "Open shift →"}
        </Button>
      </div>
    </form>
  );
}

function BatchSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: BatchOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-sm font-semibold text-ink shrink-0">{label}</div>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
        aria-label={`Default batch for ${label}`}
        className="flex-1"
      >
        {options.length === 0 ? (
          <option value="">No stock available</option>
        ) : (
          <>
            <option value="">— none —</option>
            {options.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.external_id} ({b.remaining} left)
              </option>
            ))}
          </>
        )}
      </Select>
    </div>
  );
}
