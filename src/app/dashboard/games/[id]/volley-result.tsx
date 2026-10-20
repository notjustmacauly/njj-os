"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { validVbScore, type VbOutcome } from "../volley";

export type VbResultTarget = {
  matchId: string;
  gameNo: number;
  labelA: string;
  labelB: string;
  outcome?: VbOutcome | null;
  scoreA?: number | null;
  scoreB?: number | null;
  winner?: "a" | "b" | null;
};

/**
 * Final score entry. Games play to 21 (21-20 is a win). "Time called", forfeit
 * and no contest are there for interrupted or short-handed games.
 */
export function VolleyResultModal({
  target,
  busy,
  onClose,
  onSave,
}: {
  target: VbResultTarget | null;
  busy: boolean;
  onClose: () => void;
  onSave: (outcome: VbOutcome, a: number | null, b: number | null, winner: "a" | "b" | null) => void;
}) {
  const [mode, setMode] = React.useState<VbOutcome>("played");
  const [winner, setWinner] = React.useState<"a" | "b">("a");
  const [loser, setLoser] = React.useState<number | null>(null);
  const [ta, setTa] = React.useState("");
  const [tb, setTb] = React.useState("");

  React.useEffect(() => {
    if (!target) return;
    setMode(target.outcome ?? "played");
    setWinner(target.winner ?? "a");
    if (target.outcome === "played" && target.scoreA != null && target.scoreB != null)
      setLoser(target.winner === "a" ? target.scoreB : target.scoreA);
    else setLoser(null);
    setTa(target.outcome === "timed" && target.scoreA != null ? String(target.scoreA) : "");
    setTb(target.outcome === "timed" && target.scoreB != null ? String(target.scoreB) : "");
  }, [target]);

  if (!target) return null;
  const A = `Team ${target.labelA}`;
  const B = `Team ${target.labelB}`;
  const a = mode === "played" ? (winner === "a" ? 21 : loser) : Number(ta);
  const b = mode === "played" ? (winner === "b" ? 21 : loser) : Number(tb);
  const scoreOk =
    mode === "played" ? loser != null && validVbScore(a as number, b as number, "played") : ta !== "" && tb !== "" && validVbScore(Number(ta), Number(tb), "timed");
  const ok = mode === "forfeit" || mode === "no_contest" || scoreOk;

  function save() {
    if (!ok || busy) return;
    if (mode === "played") onSave("played", a as number, b as number, winner);
    else if (mode === "timed") onSave("timed", Number(ta), Number(tb), null);
    else if (mode === "forfeit") onSave("forfeit", null, null, winner);
    else onSave("no_contest", null, null, null);
  }

  const MODES: Array<[VbOutcome, string]> = [
    ["played", "Played to 21"],
    ["timed", "Time called"],
    ["forfeit", "Forfeit"],
    ["no_contest", "No contest"],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Game ${target.gameNo} result`}
      description={`${A} vs ${B}. First to 21 wins, 21-20 counts.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!ok || busy}>
            Save result
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-1 rounded-full bg-cream p-1">
          {MODES.map(([m, l]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded-full px-2 py-1.5 text-xs font-bold transition", mode === m ? "bg-white text-ink shadow-card" : "text-inkSoft hover:text-ink")}
            >
              {l}
            </button>
          ))}
        </div>

        {mode === "played" || mode === "forfeit" ? (
          <div className="grid grid-cols-2 gap-2">
            {(["a", "b"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setWinner(side)}
                className={cn("rounded-xl px-3 py-3 text-left ring-1 transition", winner === side ? "bg-greenBg ring-green" : "bg-white ring-border hover:ring-ink/30")}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-smallcaps text-inkSoft">
                  {winner === side ? <Trophy className="w-3.5 h-3.5 text-[#BA7517]" /> : null}
                  {winner === side ? (mode === "forfeit" ? "Wins by forfeit" : "Won") : mode === "forfeit" ? "Forfeits" : "Lost"}
                </div>
                <div className="mt-0.5 font-serif text-xl font-bold text-ink">{side === "a" ? A : B}</div>
              </button>
            ))}
          </div>
        ) : null}

        {mode === "played" ? (
          <div>
            <div className="flex items-center justify-center gap-3 font-serif text-4xl font-bold text-ink tabular-nums">
              <span>{winner === "a" ? 21 : loser ?? "?"}</span>
              <span className="text-2xl text-inkSoft">-</span>
              <span>{winner === "b" ? 21 : loser ?? "?"}</span>
            </div>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-smallcaps text-inkSoft">Losing score</div>
            <div className="mt-1.5 grid grid-cols-7 gap-1">
              {Array.from({ length: 21 }, (_, n) => n).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLoser(n)}
                  className={cn("rounded-md py-1.5 text-sm font-semibold tabular-nums transition", loser === n ? "bg-ink text-white" : "bg-cream text-ink hover:bg-border/60")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mode === "timed" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-3">
              {[
                [A, ta, setTa],
                [B, tb, setTb],
              ].map(([label, val, set], i) => (
                <React.Fragment key={i}>
                  {i === 1 ? <span className="text-2xl font-bold text-inkSoft">-</span> : null}
                  <label className="text-center">
                    <span className="block text-xs font-semibold text-inkSoft">{label as string}</span>
                    <input
                      inputMode="numeric"
                      value={val as string}
                      onChange={(e) => (set as (v: string) => void)(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      className="mt-1 w-20 rounded-xl border border-border bg-white py-2 text-center font-serif text-4xl font-bold text-ink focus:outline-none focus:ring-2 focus:ring-berry/30"
                    />
                  </label>
                </React.Fragment>
              ))}
            </div>
            <p className="text-center text-xs text-inkSoft">Both under 21. Higher score wins, equal scores are a draw.</p>
          </div>
        ) : null}

        {mode === "forfeit" ? <p className="text-sm text-inkSoft">Use when a team has fewer than 6 players. Present players get the win or loss and LP, but no rating change.</p> : null}
        {mode === "no_contest" ? <p className="text-sm text-inkSoft">Nothing counts for anyone: no appearances, rating or LP.</p> : null}
        {!ok && (mode === "played" || mode === "timed") && (loser != null || ta !== "" || tb !== "") ? (
          <p className="text-sm text-coral">{mode === "timed" ? "Both scores 0 to 20, and at least one point played." : "Pick the losing score (0 to 20)."}</p>
        ) : null}
      </div>
    </Modal>
  );
}
