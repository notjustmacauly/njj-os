"use client";

import * as React from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SKILLS } from "../logic";

type Level = string;
type LevelOpt = { value: string; label: string };

type Player = { id: string; display_name: string; email: string | null; rating: number; seed_rating: number | null };
type Pass = { id: string; holder_name: string | null; buyer_email: string | null; ticket_type_name: string };

/** A player's first Rally & Rank game needs a level pick: it sets their starting rating. */
function LevelPick({ value, onChange, levels }: { value: Level | ""; onChange: (s: Level) => void; levels: LevelOpt[] }) {
  return (
    <select
      aria-label="Level"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 rounded-md border px-1.5 text-xs", value ? "border-border text-ink" : "border-coral text-coral")}
    >
      <option value="" disabled>
        Level
      </option>
      {levels.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function AddPlayers({
  master,
  passes,
  inSession,
  hasEvent,
  busy,
  onAdd,
  onCreate,
  levels,
  isSeeded,
  ratingOf,
}: {
  master: Player[];
  passes: Pass[];
  inSession: Set<string>;
  hasEvent: boolean;
  busy: boolean;
  onAdd: (playerId: string, level: Level | null) => void;
  onCreate: (name: string, email: string, level: Level) => void;
  /** Level options (defaults to the badminton levels). */
  levels?: LevelOpt[];
  /** Whether a player already has a starting rating for this sport. */
  isSeeded?: (p: Player) => boolean;
  /** Rating shown next to seeded players. */
  ratingOf?: (p: Player) => number;
}) {
  const [tab, setTab] = React.useState<"passes" | "search" | "new">(passes.length ? "passes" : "search");
  const [q, setQ] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [skill, setSkill] = React.useState<Level | "">("");
  const [levelPick, setLevels] = React.useState<Record<string, Level>>({});
  const opts = levels ?? SKILLS;
  const byEmail = new Map(master.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));

  const passList = passes
    .map((t) => ({ ...t, player: t.buyer_email ? byEmail.get(t.buyer_email.toLowerCase()) : undefined }))
    .filter((t) => !t.player || !inSession.has(t.player.id));
  const results = master
    .filter((p) => !inSession.has(p.id))
    .filter((p) => !q.trim() || `${p.display_name} ${p.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 12);

  const needsLevel = (p?: Player) => !p || !(isSeeded ? isSeeded(p) : p.seed_rating != null);

  return (
    <section className="rounded-3xl bg-white ring-1 ring-border shadow-card overflow-hidden">
      <div className="flex items-center gap-1 p-1.5 bg-cream/70">
        {(
          [
            ["passes", `Checked in ${passList.length ? `(${passList.length})` : ""}`],
            ["search", "Past players"],
            ["new", "New"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition", tab === k ? "bg-white text-ink shadow-card" : "text-inkSoft hover:text-ink")}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "passes" ? (
        passList.length === 0 ? (
          <p className="px-4 py-5 text-sm text-inkSoft">{hasEvent ? "Everyone checked in is already playing tonight." : "This session isn't linked to an event."}</p>
        ) : (
          <ul className="divide-y divide-border max-h-72 overflow-y-auto">
            {passList.map((t) => {
              const lv = levelPick[t.id] ?? "";
              const need = needsLevel(t.player);
              return (
                <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{t.player?.display_name ?? t.holder_name ?? "Guest"}</div>
                    <div className="truncate text-xs text-inkSoft">{t.ticket_type_name}</div>
                  </div>
                  {need ? <LevelPick levels={opts} value={lv} onChange={(s) => setLevels((x) => ({ ...x, [t.id]: s }))} /> : null}
                  <Button
                    size="sm"
                    disabled={busy || (need && !lv)}
                    onClick={() =>
                      t.player ? onAdd(t.player.id, need ? (lv) : null) : onCreate(t.holder_name ?? "Guest", t.buyer_email ?? "", lv)
                    }
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {tab === "search" ? (
        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-inkSoft absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-8" />
          </div>
          <ul className="divide-y divide-border max-h-64 overflow-y-auto">
            {results.map((p) => {
              const lv = levelPick[p.id] ?? "";
              const need = needsLevel(p);
              return (
                <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-ink">{p.display_name}</span>
                  {need ? (
                    <LevelPick levels={opts} value={lv} onChange={(s) => setLevels((x) => ({ ...x, [p.id]: s }))} />
                  ) : (
                    <span className="text-xs text-inkSoft tabular-nums">{Number(ratingOf ? ratingOf(p) : p.rating).toFixed(2)}</span>
                  )}
                  <Button size="sm" disabled={busy || (need && !lv)} onClick={() => onAdd(p.id, need ? (lv) : null)}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </li>
              );
            })}
            {results.length === 0 ? <li className="py-3 text-sm text-inkSoft">No matches. Use New.</li> : null}
          </ul>
        </div>
      ) : null}

      {tab === "new" ? (
        <form
          className="p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim() || !skill) return;
            onCreate(newName, newEmail, skill);
            setNewName("");
            setNewEmail("");
            setSkill("");
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="np_name" required>
              Name
            </Label>
            <Input id="np_name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np_email">Email</Label>
            <Input id="np_email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="So their points reach their account" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np_skill" required>
              Level
            </Label>
            <Select id="np_skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="" disabled>
                Pick a level
              </option>
              {opts.map((s: LevelOpt) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-inkSoft">Sets their starting rating. Staff only, never shown publicly.</p>
          </div>
          <Button type="submit" disabled={busy || !newName.trim() || !skill} className="w-full">
            <UserPlus className="w-4 h-4" /> Add to tonight
          </Button>
        </form>
      ) : null}
    </section>
  );
}
