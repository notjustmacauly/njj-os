"use client";

import * as React from "react";
import { Shuffle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { SQUADS, type Squad } from "../logic";

type Member = { player_id: string; squad: string | null; pair_no: number | null; active: boolean; rating: number };

const SQUAD_STYLE: Record<Squad, string> = {
  A: "bg-[#FBEAF0] ring-[#F4C0D1]",
  B: "bg-[#E6F1FB] ring-[#B5D4F4]",
  C: "bg-[#EAF3DE] ring-[#C0DD97]",
};

/**
 * Team night: staff generate three balanced squads, then pairs inside each
 * squad. Tap a player then another to swap squads/pairs, or tap a squad's
 * "Move here" to drop the selected player in.
 */
export function SquadsPanel({
  members,
  record,
  open,
  busy,
  moving,
  token,
  onGenerate,
  onPair,
  onMoveTo,
}: {
  members: Member[];
  record: Record<Squad, { w: number; g: number }>;
  open: boolean;
  busy: boolean;
  moving: boolean;
  token: (playerId: string) => React.ReactNode;
  onGenerate: () => void;
  onPair: () => void;
  onMoveTo: (squad: Squad | null) => void;
}) {
  const assigned = members.some((m) => m.squad);
  const unassigned = members.filter((m) => !m.squad);

  return (
    <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif font-bold text-lg text-ink flex items-center gap-2">
          <Users className="w-5 h-5 text-berry" /> Squads
        </h2>
        <span className="text-xs text-inkSoft">Courts cycle A v B, B v C, C v A. Top squad +10 LP, second +5.</span>
        {open ? (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={busy || members.length < 6}
              onClick={() => {
                if (!assigned || window.confirm("Regenerate all three squads? Current squads and pairs will be replaced.")) onGenerate();
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              <Shuffle className="w-3.5 h-3.5" /> {assigned ? "Regenerate squads" : "Generate squads"}
            </button>
            {assigned ? (
              <button
                type="button"
                disabled={busy}
                onClick={onPair}
                className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3.5 py-1.5 text-xs font-bold text-ink ring-1 ring-border disabled:opacity-40"
              >
                Pair up inside squads
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!assigned ? (
        <p className="mt-3 text-sm text-inkSoft">
          {members.length < 6 ? "Add at least 6 players, then generate squads." : "Everyone checked in? Generate three balanced squads."}
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {SQUADS.map((s) => {
            const list = members.filter((m) => m.squad === s);
            const avg = list.length ? list.reduce((a, m) => a + m.rating, 0) / list.length : 0;
            const pairs = new Map<number, Member[]>();
            const loose: Member[] = [];
            for (const m of list) {
              if (m.pair_no == null) loose.push(m);
              else pairs.set(m.pair_no, [...(pairs.get(m.pair_no) ?? []), m]);
            }
            const rec = record[s];
            return (
              <div key={s} className={cn("rounded-2xl ring-1 p-3", SQUAD_STYLE[s])}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif font-bold text-ink">Squad {s}</span>
                  <span className="text-xs text-inkSoft tabular-nums">
                    {list.length} players · avg {avg.toFixed(2)} · {rec.w}W {rec.g - rec.w}L
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {Array.from(pairs.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([no, ms]) => (
                      <div key={no} className="flex flex-wrap items-center gap-1 rounded-xl bg-white/70 px-1.5 py-1">
                        <span className="w-5 text-center text-[10px] font-bold text-inkSoft">{no}</span>
                        {ms.map((m) => (
                          <React.Fragment key={m.player_id}>{token(m.player_id)}</React.Fragment>
                        ))}
                      </div>
                    ))}
                  {loose.length ? (
                    <div className="flex flex-wrap gap-1 px-1">
                      {loose.map((m) => (
                        <React.Fragment key={m.player_id}>{token(m.player_id)}</React.Fragment>
                      ))}
                    </div>
                  ) : null}
                </div>
                {moving && open ? (
                  <button
                    type="button"
                    onClick={() => onMoveTo(s)}
                    className="mt-2 w-full rounded-full border border-dashed border-ink/30 py-1 text-xs font-semibold text-ink hover:bg-white/60"
                  >
                    Move here
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {assigned && unassigned.length ? (
        <div className="mt-3 rounded-2xl bg-cream/70 px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-smallcaps text-inkSoft">No squad yet (late arrivals)</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {unassigned.map((m) => (
              <React.Fragment key={m.player_id}>{token(m.player_id)}</React.Fragment>
            ))}
          </div>
          <p className="mt-1 text-xs text-inkSoft">Tap a player, then Move here on a squad.</p>
        </div>
      ) : null}
    </section>
  );
}
