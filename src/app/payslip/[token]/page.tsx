import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type BreakdownRow = { label?: string; hours?: number | string; rate?: number | string; amount?: number | string };
type Payslip = {
  run: { label: string; period_start: string; period_end: string; pay_date: string; status: string };
  name: string;
  pay_type: string;
  hours: number | string | null;
  rate: number | string | null;
  base_amount: number | string;
  adjustment: number | string;
  adjust_note: string | null;
  net_amount: number | string;
  breakdown: BreakdownRow[] | null;
  account_code: string | null;
  account_name: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PayslipPage({ params }: { params: { token: string } }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_payslip", { p_token: params.token });
  const p = (data ?? null) as Payslip | null;

  if (!p) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">Payslip not found</p>
          <p className="text-sm text-inkSoft mt-1">
            This link may be incorrect or the run isn&rsquo;t finalised yet. Please contact {COMPANY.email}.
          </p>
        </div>
      </div>
    );
  }

  const breakdown = Array.isArray(p.breakdown) ? p.breakdown : [];
  const hasBreakdown = breakdown.length > 0;
  const adj = Number(p.adjustment ?? 0);

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      <div className="max-w-2xl mx-auto p-4 print:p-0">
        <div className="flex justify-end mb-3 print:hidden">
          <PrintButton />
        </div>

        <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden print:border-0 print:shadow-none print:rounded-none">
          <div className="bg-salmon">
            <Image src={COMPANY.logoSrc} alt={COMPANY.brandName} width={320} height={160} priority className="w-40 h-auto p-4" />
          </div>

          <div className="p-8 space-y-7">
            <div className="flex items-start justify-between gap-6">
              <div className="text-sm">
                <div className="font-bold text-ink">{COMPANY.registeredName}</div>
                {COMPANY.address ? <div className="text-inkSoft whitespace-pre-line">{COMPANY.address}</div> : null}
                <div className="text-inkSoft">{COMPANY.email}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-ink tracking-tight">PAYSLIP</div>
                <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mt-2">Pay period</div>
                <div className="text-sm text-ink">{fmtDate(p.run.period_start)} – {fmtDate(p.run.period_end)}</div>
                <div className="text-xs text-inkSoft mt-1">Pay date {fmtDate(p.run.pay_date)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">Employee</div>
                <div className="font-semibold text-ink text-base">{p.name}</div>
                <div className="text-inkSoft capitalize">{p.pay_type} pay</div>
              </div>
              {p.account_name ? (
                <div className="text-right">
                  <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">Paid via</div>
                  <div className="text-ink">{p.account_name}</div>
                </div>
              ) : null}
            </div>

            {/* Earnings */}
            <div>
              <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">Earnings</div>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-cream text-inkSoft">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Description</th>
                      <th className="text-right font-semibold px-3 py-2">Hours</th>
                      <th className="text-right font-semibold px-3 py-2">Rate</th>
                      <th className="text-right font-semibold px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hasBreakdown ? (
                      breakdown.map((b, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-ink">{b.label || "Work"}</td>
                          <td className="px-3 py-2 text-right text-inkSoft">{b.hours != null && b.hours !== "" ? Number(b.hours) : "—"}</td>
                          <td className="px-3 py-2 text-right text-inkSoft">{b.rate != null && b.rate !== "" ? formatPHP(Number(b.rate)) : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatPHP(Number(b.amount ?? 0))}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-2 text-ink">Base pay</td>
                        <td className="px-3 py-2 text-right text-inkSoft">{p.pay_type === "hourly" && p.hours != null ? Number(p.hours) : "—"}</td>
                        <td className="px-3 py-2 text-right text-inkSoft">{p.rate != null ? formatPHP(Number(p.rate)) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{formatPHP(Number(p.base_amount ?? 0))}</td>
                      </tr>
                    )}
                    {adj !== 0 ? (
                      <tr>
                        <td className="px-3 py-2 text-ink">{p.adjust_note || (adj > 0 ? "Addition" : "Deduction")}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{formatPHP(adj)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Net */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1">
                <div className="flex justify-between text-sm text-inkSoft">
                  <span>Base</span><span className="tabular-nums">{formatPHP(Number(p.base_amount ?? 0))}</span>
                </div>
                {adj !== 0 ? (
                  <div className="flex justify-between text-sm text-inkSoft">
                    <span>Adjustment</span><span className="tabular-nums">{formatPHP(adj)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-bold text-ink border-t border-border pt-1">
                  <span>Net pay</span><span className="tabular-nums">{formatPHP(Number(p.net_amount ?? 0))}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-inkSoft border-t border-border pt-3">
              This payslip is generated by {COMPANY.brandName}. Questions? Contact {COMPANY.email}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
