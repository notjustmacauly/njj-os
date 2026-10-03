"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ImageUp, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { shrinkImage } from "@/app/(store)/_components/pay-step";

export type Venue = { id: string; name: string };
export type SportRow = { id?: string; name: string; capacity: number; sold?: number };
export type EventDraft = {
  id?: string;
  slug?: string;
  series: string;
  name: string;
  description: string;
  cover_image_url: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  venue_id: string;
  pass_price: number;
  paddle_price: number | null;
  status: "draft" | "published" | "closed";
  sports: SportRow[];
};

const NEW_SERIES = "__new__";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function EventEditor({
  initial,
  venues,
  seriesTemplates,
}: {
  initial: EventDraft;
  venues: Venue[];
  /** Latest event per series — picking a series pre-fills from it (new events only). */
  seriesTemplates: Record<string, Omit<EventDraft, "event_date" | "status">>;
}) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !initial.id;
  const [d, setD] = React.useState<EventDraft>(initial);
  const [customSeries, setCustomSeries] = React.useState(false);
  const [repeat, setRepeat] = React.useState("1");
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const seriesNames = Object.keys(seriesTemplates).sort();
  const soldTotal = d.sports.reduce((a, s) => a + (s.sold ?? 0), 0);

  function pickSeries(v: string) {
    if (v === NEW_SERIES) {
      setCustomSeries(true);
      set("series", "");
      return;
    }
    setCustomSeries(false);
    const t = seriesTemplates[v];
    if (isNew && t) {
      setD((x) => ({
        ...x,
        ...t,
        series: v,
        sports: t.sports.map((s) => ({ name: s.name, capacity: s.capacity })),
      }));
    } else {
      set("series", v);
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    const small = await shrinkImage(file);
    const ext = small.type === "image/png" ? "png" : small.type === "image/webp" ? "webp" : "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error: err } = await supabase.storage.from("event-images").upload(path, small, { contentType: small.type });
    setUploading(false);
    if (err) return setError(`Image upload failed: ${err.message}`);
    set("cover_image_url", supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl);
  }

  function validate(): string | null {
    if (!d.name.trim()) return "Give the event a title.";
    if (!d.event_date) return "Pick a date.";
    if (d.end_time && d.start_time && d.end_time <= d.start_time) return "End time must be after the start time.";
    if (!d.sports.length) return "Add at least one sport.";
    if (d.sports.some((s) => !s.name.trim() || !Number.isInteger(s.capacity) || s.capacity < 0))
      return "Each sport needs a name and a whole-number capacity.";
    if (d.sports.some((s) => s.sold && s.capacity < s.sold)) return "A capacity can't be lower than the passes already sold.";
    if (!(d.pass_price >= 0)) return "Pass price must be ₱0 or more.";
    return null;
  }

  async function save() {
    if (saving) return;
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const base = {
      series: d.series.trim() || null,
      name: d.name.trim(),
      description: d.description.trim() || null,
      cover_image_url: d.cover_image_url,
      start_time: d.start_time || null,
      end_time: d.end_time || null,
      venue_id: d.venue_id || null,
      venue: venues.find((x) => x.id === d.venue_id)?.name ?? null,
      pass_price: d.pass_price,
      paddle_price: d.paddle_price,
      status: d.status,
      published_at: d.status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (isNew) {
        const weeks = Math.min(Math.max(parseInt(repeat, 10) || 1, 1), 12);
        const { data: auth } = await supabase.auth.getUser();
        let firstId: string | null = null;
        for (let k = 0; k < weeks; k++) {
          const date = addDays(d.event_date, k * 7);
          const slug = `${slugify(d.name)}-${date}`;
          const { data: ev, error: e1 } = await supabase
            .from("events")
            .insert({ ...base, event_date: date, slug, created_by_user_id: auth.user?.id ?? null })
            .select("id")
            .single();
          if (e1) throw new Error(e1.code === "23505" ? `There's already a "${d.name}" on ${date}.` : e1.message);
          firstId ??= ev.id;
          const { error: e2 } = await supabase
            .from("event_sports")
            .insert(d.sports.map((s, i) => ({ event_id: ev.id, name: s.name.trim(), capacity: s.capacity, sort_order: i })));
          if (e2) throw new Error(e2.message);
        }
        toast.push(weeks > 1 ? `${weeks} weekly events created` : "Event created", "success");
        router.push(weeks > 1 ? "/dashboard/website/events" : `/dashboard/website/events/${firstId}`);
      } else {
        const { error: e1 } = await supabase.from("events").update({ ...base, event_date: d.event_date }).eq("id", d.id!);
        if (e1) throw new Error(e1.message);
        const keep = d.sports.filter((s) => s.id).map((s) => s.id!);
        const removed = initial.sports.filter((s) => s.id && !keep.includes(s.id));
        for (const s of removed) {
          if (s.sold) throw new Error(`${s.name} already has passes sold — it can't be removed.`);
          const { error } = await supabase.from("event_sports").delete().eq("id", s.id!);
          if (error) throw new Error(error.message);
        }
        for (let i = 0; i < d.sports.length; i++) {
          const s = d.sports[i];
          const row = { name: s.name.trim(), capacity: s.capacity, sort_order: i };
          const { error } = s.id
            ? await supabase.from("event_sports").update(row).eq("id", s.id)
            : await supabase.from("event_sports").insert({ ...row, event_id: d.id });
          if (error) throw new Error(error.message);
        }
        toast.push("Event saved", "success");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const supabase = createClient();
    const { error: err } = await supabase.from("events").update({ deleted_at: new Date().toISOString(), status: "closed" }).eq("id", d.id!);
    setConfirmDelete(false);
    if (err) return toast.push(err.message, "error");
    toast.push("Event deleted", "success");
    router.push("/dashboard/website/events");
  }

  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-5 space-y-5">
      <div className="grid md:grid-cols-[240px_1fr] gap-5">
        {/* Main image */}
        <div>
          <Label>Main image</Label>
          <label className="mt-1 block aspect-[16/10] rounded-lg border-2 border-dashed border-border hover:border-berry/40 overflow-hidden cursor-pointer bg-cream relative">
            {d.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.cover_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-inkSoft text-xs">
                <ImageUp className="w-6 h-6 text-berry" />
                {uploading ? "Uploading…" : "Upload image"}
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-inkSoft mt-1">{uploading ? "Uploading…" : "Wide photos work best (16:9). Tap to replace."}</p>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ev_series">Series</Label>
              {customSeries ? (
                <Input id="ev_series" value={d.series} onChange={(e) => set("series", e.target.value)} placeholder="New series name" />
              ) : (
                <Select id="ev_series" value={d.series} onChange={(e) => pickSeries(e.target.value)}>
                  <option value="">One-off event</option>
                  {seriesNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={NEW_SERIES}>+ New series…</option>
                </Select>
              )}
              {isNew && !customSeries && d.series ? (
                <p className="text-xs text-inkSoft">Filled in from the last {d.series} — edit anything.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev_name" required>
                Title
              </Label>
              <Input id="ev_name" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Total Tuesday" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ev_desc">Description</Label>
            <Textarea
              id="ev_desc"
              rows={4}
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What's happening, who it's for, what to bring…"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ev_date" required>
                Date
              </Label>
              <Input id="ev_date" type="date" value={d.event_date} onChange={(e) => set("event_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev_start">Start</Label>
              <Input id="ev_start" type="time" value={d.start_time} onChange={(e) => set("start_time", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev_end">End</Label>
              <Input id="ev_end" type="time" value={d.end_time} onChange={(e) => set("end_time", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ev_venue">Location</Label>
            <Select id="ev_venue" value={d.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
              <option value="">Choose a venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Sports */}
      <div>
        <div className="flex items-center justify-between">
          <Label>Sports · one pass = one sport</Label>
          <button
            type="button"
            onClick={() => set("sports", [...d.sports, { name: "", capacity: 24 }])}
            className="inline-flex items-center gap-1 text-sm font-semibold text-berry hover:underline"
          >
            <Plus className="w-4 h-4" /> Add sport
          </button>
        </div>
        <div className="mt-2 rounded-lg border border-border divide-y divide-border">
          {d.sports.length === 0 ? <p className="px-4 py-3 text-sm text-inkSoft">No sports yet — add one.</p> : null}
          {d.sports.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex items-center gap-3 px-3 py-2">
              <Input
                value={s.name}
                onChange={(e) => set("sports", d.sports.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="Pickleball"
                className="flex-1"
                aria-label="Sport name"
              />
              <div className="w-28">
                <NumberInput
                  min="0"
                  step="1"
                  value={String(s.capacity)}
                  onChange={(e) =>
                    set("sports", d.sports.map((x, j) => (j === i ? { ...x, capacity: parseInt(e.target.value, 10) || 0 } : x)))
                  }
                  aria-label="Capacity"
                />
              </div>
              <span className="w-20 text-xs text-inkSoft">{s.sold ? `${s.sold} sold` : "spots"}</span>
              <button
                type="button"
                onClick={() => set("sports", d.sports.filter((_, j) => j !== i))}
                disabled={!!s.sold}
                className="p-1.5 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-30"
                aria-label={`Remove ${s.name || "sport"}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <Label htmlFor="ev_price">Pass price</Label>
          <NumberInput
            id="ev_price"
            prefix="₱"
            min="0"
            step="1"
            value={String(d.pass_price)}
            onChange={(e) => set("pass_price", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-ink flex items-center gap-2 select-none cursor-pointer h-[38px]">
            <input
              type="checkbox"
              checked={d.paddle_price != null}
              onChange={(e) => set("paddle_price", e.target.checked ? 50 : null)}
            />
            Paddle rental add-on
          </label>
        </div>
        {d.paddle_price != null ? (
          <div className="space-y-1">
            <Label htmlFor="ev_paddle">Paddle price</Label>
            <NumberInput
              id="ev_paddle"
              prefix="₱"
              min="0"
              step="1"
              value={String(d.paddle_price)}
              onChange={(e) => set("paddle_price", Number(e.target.value))}
            />
          </div>
        ) : (
          <div />
        )}
        <div className="space-y-1">
          <Label htmlFor="ev_status">Status</Label>
          <Select id="ev_status" value={d.status} onChange={(e) => set("status", e.target.value as EventDraft["status"])}>
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published</option>
            <option value="closed">Closed (hidden)</option>
          </Select>
        </div>
      </div>

      {error ? <p className="text-sm text-coral font-semibold">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {isNew ? (
          <label className="text-sm text-ink flex items-center gap-2">
            Repeat weekly for
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value)} className="w-20">
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            {repeat === "1" ? "week (just this date)" : "weeks"}
          </label>
        ) : d.status === "published" && d.slug ? (
          <a
            href={`/events/${d.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-berry hover:underline"
          >
            View on site <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : null}
        <div className="ml-auto flex gap-2">
          {!isNew ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={saving || soldTotal > 0} title={soldTotal ? "Passes are sold — set it to Closed instead" : ""}>
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving || uploading}>
            {saving ? "Saving…" : isNew ? (d.status === "published" ? "Publish" : "Save draft") : "Save changes"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${d.name}?`}
        description="It disappears from the site and studio. Only possible while no passes are sold."
        confirmLabel="Delete"
        destructive
        busy={false}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
