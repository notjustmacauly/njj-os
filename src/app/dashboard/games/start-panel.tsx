"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Pencil, Plus, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { FORMATS, formatLabel, seasonName, seasonOf, SPORTS, suggestedFormat, type Format, type Sport } from "./logic";
import { NewSessionForm } from "./new-session-form";

export type Template = {
  id: string;
  name: string;
  sport: Sport;
  ruleset: "casual" | "rally_rank";
  format: Format | null;
  courts: number;
  team_size: number;
  blurb: string | null;
  sort: number;
};
type EventOpt = { id: string; name: string; event_date: string; start_time: string | null };

const CARD_STYLE: Record<string, string> = {
  classic: "from-[#3E8E5A] to-[#4FA56B]",
  team: "from-[#2F6FA8] to-[#3C86C6]",
  double: "from-[#C2410C] to-[#E07856]",
  rivalry: "from-[#5B21B6] to-[#7C3AED]",
  casual: "from-[#6B7280] to-[#9CA3AF]",
};

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Step 1: which event. Step 2: tap a saved card to open the queue. */
export function StartPanel({ events, templates, canEdit }: { events: EventOpt[]; templates: Template[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [eventId, setEventId] = React.useState(events.find((e) => e.event_date === today)?.id ?? events[0]?.id ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState(false);
  const [editing, setEditing] = React.useState<Template | "new" | null>(null);
  const [manage, setManage] = React.useState(false);
  const date = events.find((e) => e.id === eventId)?.event_date ?? today;
  const suggested = suggestedFormat(date);
  const season = seasonOf(date);

  async function start(t: Template) {
    if (busy) return;
    setBusy(t.id);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const sportLabel = SPORTS.find((s) => s.value === t.sport)?.label ?? t.sport;
    const { data, error } = await supabase
      .from("game_sessions")
      .insert({
        event_id: eventId || null,
        sport: t.sport,
        courts: t.courts,
        team_size: t.team_size,
        ruleset: t.ruleset,
        format: t.ruleset === "rally_rank" ? t.format : null,
        session_date: date,
        template_id: t.id,
        title: `${sportLabel}: ${t.name}`,
        created_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();
    setBusy(null);
    if (error) return toast.push(error.message, "error");
    router.push(`/dashboard/games/${data.id}`);
  }

  return (
    <section className="space-y-5">
      <div className="bg-white border border-border rounded-lg shadow-card p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-smallcaps text-inkSoft">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-white">1</span> Choose the event
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEventId(e.id)}
              className={cn(
                "rounded-xl px-4 py-2.5 text-left ring-1 transition",
                eventId === e.id ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-border hover:ring-ink/40",
              )}
            >
              <span className="block text-sm font-semibold">{e.name}</span>
              <span className={cn("flex items-center gap-1 text-xs", eventId === e.id ? "text-white/70" : "text-inkSoft")}>
                <CalendarDays className="w-3 h-3" /> {fmtDate(e.event_date)}
                {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEventId("")}
            className={cn(
              "rounded-xl px-4 py-2.5 text-left ring-1 transition",
              eventId === "" ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-border hover:ring-ink/40",
            )}
          >
            <span className="block text-sm font-semibold">No event</span>
            <span className={cn("block text-xs", eventId === "" ? "text-white/70" : "text-inkSoft")}>Practice or one-off · {fmtDate(today)}</span>
          </button>
        </div>
        {events.length === 0 ? <p className="mt-2 text-xs text-inkSoft">No events today or tomorrow. Add one in Website studio, or start without one.</p> : null}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-smallcaps text-inkSoft">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-white">2</span> Tap a card to open the queue
          </div>
          <span className="text-xs text-inkSoft">{season ? `Counts toward ${seasonName(season)} once finalized.` : "Before 1 Nov: practice, won't count toward a season."}</span>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setManage((m) => !m)}
              className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", manage ? "bg-ink text-white" : "text-inkSoft hover:text-ink")}
            >
              <Settings2 className="w-3.5 h-3.5" /> {manage ? "Done editing" : "Edit cards"}
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {templates.map((t) => {
            const ready = t.ruleset === "casual" || FORMATS.find((f) => f.value === t.format)?.ready !== false;
            const sportLabel = SPORTS.find((s) => s.value === t.sport)?.label ?? t.sport;
            return (
              <div key={t.id} className="relative h-full">
                <button
                  type="button"
                  disabled={!ready || !!busy || manage}
                  onClick={() => start(t)}
                  className={cn(
                    "group relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left text-white shadow-card transition",
                    CARD_STYLE[t.ruleset === "casual" ? "casual" : t.format ?? "classic"],
                    ready && !manage ? "hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]" : "opacity-60",
                  )}
                >
                  <div className="text-[11px] font-bold uppercase tracking-smallcaps text-white/75">{sportLabel}</div>
                  <div className="mt-1 font-serif text-2xl font-bold leading-tight">{t.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                      {t.ruleset === "rally_rank" ? formatLabel(t.format) : "Casual"}
                    </span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                      {t.courts} court{t.courts === 1 ? "" : "s"}
                    </span>
                    {suggested && t.format === suggested && t.ruleset === "rally_rank" ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink">This week</span>
                    ) : null}
                  </div>
                  {t.blurb ? <p className="mt-3 text-sm text-white/85">{t.blurb}</p> : null}
                  <div className="mt-auto pt-4 text-sm font-bold">{!ready ? "Coming in December" : busy === t.id ? "Opening…" : "Start queue →"}</div>
                </button>
                {manage ? (
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink shadow"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                ) : null}
              </div>
            );
          })}
          {manage ? (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex min-h-[180px] items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border text-sm font-semibold text-inkSoft hover:text-ink"
            >
              <Plus className="w-4 h-4" /> New card
            </button>
          ) : null}
        </div>
        <button type="button" onClick={() => setCustom((c) => !c)} className="mt-3 text-xs font-semibold text-inkSoft underline underline-offset-4 hover:text-ink">
          {custom ? "Hide custom session" : "Or start a custom session"}
        </button>
      </div>

      {custom ? <NewSessionForm events={events} /> : null}
      {editing ? <TemplateEditor template={editing === "new" ? null : editing} nextSort={templates.length + 1} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function TemplateEditor({ template, nextSort, onClose }: { template: Template | null; nextSort: number; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(template?.name ?? "");
  const [sport, setSport] = React.useState<Sport>(template?.sport ?? "badminton");
  const [ruleset, setRuleset] = React.useState(template?.ruleset ?? "rally_rank");
  const [format, setFormat] = React.useState<Format>(template?.format ?? "classic");
  const [courts, setCourts] = React.useState(String(template?.courts ?? 3));
  const [blurb, setBlurb] = React.useState(template?.blurb ?? "");
  const [busy, setBusy] = React.useState(false);
  const teamSize = SPORTS.find((s) => s.value === sport)?.teamSize ?? 6;
  const ranked = ruleset === "rally_rank" && teamSize === 2;

  async function save(archive = false) {
    if (!name.trim() && !archive) return;
    setBusy(true);
    const supabase = createClient();
    const row = archive
      ? { archived_at: new Date().toISOString() }
      : {
          name: name.trim(),
          sport,
          ruleset: ranked ? "rally_rank" : "casual",
          format: ranked ? format : null,
          courts: Number(courts),
          team_size: teamSize,
          blurb: blurb.trim() || null,
        };
    const { error } = template
      ? await supabase.from("game_templates").update(row).eq("id", template.id)
      : await supabase.from("game_templates").insert({ ...row, sort: nextSort });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? "Edit card" : "New card"}
      footer={
        <div className="flex items-center gap-2">
          {template ? (
            <Button variant="dangerGhost" onClick={() => window.confirm(`Remove "${template.name}"? Past sessions keep their results.`) && save(true)} disabled={busy}>
              Remove
            </Button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save()} disabled={busy || !name.trim()}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="tp_name" required>
            Name
          </Label>
          <Input id="tp_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Double Damage" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tp_sport">Sport</Label>
            <Select id="tp_sport" value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              {SPORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tp_courts">Courts</Label>
            <Select id="tp_courts" value={courts} onChange={(e) => setCourts(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tp_rules">Rules</Label>
            <Select id="tp_rules" value={ranked ? "rally_rank" : "casual"} disabled={teamSize !== 2} onChange={(e) => setRuleset(e.target.value as "casual" | "rally_rank")}>
              <option value="rally_rank">Rally &amp; Rank (ranked)</option>
              <option value="casual">Casual</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tp_format">Format</Label>
            <Select id="tp_format" value={format} disabled={!ranked} onChange={(e) => setFormat(e.target.value as Format)}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tp_blurb">Card text</Label>
          <Input id="tp_blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="One line shown on the card" />
        </div>
      </div>
    </Modal>
  );
}
