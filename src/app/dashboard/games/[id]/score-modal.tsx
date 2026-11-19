"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { scoreCap, validScore } from "../logic";
import { shortName } from "./player-token";

export type ScoreTarget = {
  matchId: string;
  court: number;
  teamA: string[];
  teamB: string[];
  winner: "a" | "b";
  scoreA?: number | null;
  scoreB?: number | null;
  finish?: "target" | "timed" | null;
};

/**
 * Quick score pad. Staff tap Won on a side, the winner gets 21 (or 31), then one tap
 * on the loser's score. Rally & Rank needs a valid score; casual sessions may
 * save the winner only.
 */
export function ScoreModal({
  target,
  points = 21,
  ranked,
  nameOf,
  busy,
  onClose,
  onSave,
}: {
  target: ScoreTarget | null;
  /** Points to win (21 or 31). */
  points?: number;
  ranked: boolean;
  nameOf: (id: string) => string;
  busy: boolean;
  onClose: () => void;
  onSave: (winner: "a" | "b", scoreA: number | null, scoreB: number | null, finish: "target" | "timed") => void;
}) {
  const [winner, setWinner] = React.useState<"a" | "b">("a");
  const cap = scoreCap(points);
  const [w, setW] = React.useState(String(points));
  const [l, setL] = React.useState("");
  const [timed, setTimed] = React.useState(false);
  const loserRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!target) return;
    setWinner(target.winner);
    const ws = target.winner === "a" ? target.scoreA : target.scoreB;
    const ls = target.winner === "a" ? target.scoreB : target.scoreA;
    setW(ws != null ? String(ws) : String(points));
    setL(ls != null ? String(ls) : "");
    setTimed(target.finish === "timed");
    setTimeout(() => loserRef.current?.focus(), 50);
  }, [target]);

  if (!target) return null;
  const wn = Number(w);
  const ln = Number(l);
  const hasScore = w.trim() !== "" && l.trim() !== "";
  const ok = hasScore && validScore(wn, ln, timed ? "timed" : "target", points);
  const canSave = ranked ? ok : !hasScore || wn > ln;
  const team = (side: "a" | "b") => (side === "a" ? target.teamA : target.teamB).map((id) => shortName(nameOf(id))).join(" & ");

  // After deuce the winner's score follows the loser's (22–20 … 30–29 for 21; 32–30 … 40–39 for 31).
  function pickLoser(n: number) {
    setL(String(n));
    if (!timed) setW(String(n >= points - 1 ? Math.min(cap, n + 2) : points));
  }

  function save() {
    if (!canSave || busy) return;
    const a = hasScore ? (winner === "a" ? wn : ln) : null;
    const b = hasScore ? (winner === "a" ? ln : wn) : null;
    onSave(winner, a, b, timed ? "timed" : "target");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Court ${target.court} result`}
      description={ranked ? `Games to ${points}, win by 2, up to ${cap}.` : "Score is optional for casual games."}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave || busy}>
            Save result
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-2">
          {(["a", "b"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setWinner(side)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-left ring-1 transition",
                winner === side ? "bg-greenBg ring-green text-ink" : "bg-white ring-border text-inkSoft hover:text-ink",
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-smallcaps">
                {winner === side ? <Trophy className="w-3.5 h-3.5 text-[#BA7517]" /> : null}
                {winner === side ? "Won" : "Lost"}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold">{team(side)}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <input
            aria-label="Winner score"
            inputMode="numeric"
            value={w}
            onChange={(e) => setW(e.target.value.replace(/\D/g, "").slice(0, 2))}
            className="w-20 rounded-xl border border-border bg-white text-center font-serif text-4xl font-bold text-ink py-2 focus:outline-none focus:ring-2 focus:ring-berry/30"
          />
          <span className="text-2xl font-bold text-inkSoft">–</span>
          <input
            ref={loserRef}
            aria-label="Losing side score"
            inputMode="numeric"
            value={l}
            onChange={(e) => setL(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="?"
            className="w-20 rounded-xl border border-border bg-white text-center font-serif text-4xl font-bold text-ink py-2 focus:outline-none focus:ring-2 focus:ring-berry/30"
          />
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-smallcaps text-inkSoft">Losing score</div>
          <div className={`mt-1.5 grid gap-1 ${points > 21 ? "grid-cols-10" : "grid-cols-8"}`}>
            {Array.from({ length: cap }, (_, n) => n).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pickLoser(n)}
                className={cn(
                  "rounded-md py-1.5 text-sm font-semibold tabular-nums transition",
                  l === String(n) ? "bg-ink text-white" : "bg-cream text-ink hover:bg-border/60",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="w-4 h-4 accent-berry" />
          Time called (game cut short, the side ahead wins)
        </label>

        {hasScore && !ok && ranked ? (
          <p className="text-sm text-coral">
            {wn <= ln ? "The winning side needs the higher score." : `Not a valid finish. ${points} needs a 2 point lead (${points}–${points - 2}), after that win by 2 up to ${cap}–${cap - 1}.`}
          </p>
        ) : null}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
