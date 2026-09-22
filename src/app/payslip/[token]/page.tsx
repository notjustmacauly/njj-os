import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type Payslip = {
  run: { label: string; period_start: string; period_end: string; pay_date: string; status: string };
  name: string;
  pay_type: string;
  hours: number | string | null;
  account_code: string | null;
  account_name: string | null;
  base_amount: number | string;
  overtime_pay: number | string;
  bonuses: number | string;
  tax: number | string;
  philhealth: number | string;
  sss: number | string;
  pagibig: number | string;
  absences: number | string;
  other_deductions: number | string;
  advance_repayment: number | string;
  net_amount: number | string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-US", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}
const n = (v: number | string | null | undefined) => Number(v ?? 0);

export default async function PayslipPage({ params }: { params: { token: string } }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_payslip", { p_token: params.token });
  const p = (data ?? null) as Payslip | null;

  if (!p) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">Payslip not found</p>
          <p className="text-sm text-inkSoft mt-1">This link may be incorrect or the run isn&rsquo;t finalised yet. Please contact {COMPANY.email}.</p>
        </div>
      </div>
    );
  }

  const gross = n(p.base_amount) + n(p.overtime_pay) + n(p.bonuses);
  const totalDed = n(p.tax) + n(p.philhealth) + n(p.sss) + n(p.pagibig) + n(p.absences) + n(p.other_deductions) + n(p.advance_repayment);
  const earnings: [string, number][] = [
    ["Base salary", n(p.base_amount)],
    ["Overtime pay", n(p.overtime_pay)],
    ["Bonuses", n(p.bonuses)],
  ];
  const deductions: [string, number][] = [
    ["Withholding tax", n(p.tax)],
    ["PhilHealth", n(p.philhealth)],
    ["SSS", n(p.sss)],
    ["Pag-IBIG", n(p.pagibig)],
    ["Absences", n(p.absences)],
    ["Other deductions", n(p.other_deductions)],
    ["Cash advance repayment", n(p.advance_repayment)],
  ];

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      <div className="max-w-2xl mx-auto p-4 print:p-0">
        <div className="flex justify-end mb-3 print:hidden"><PrintButton /></div>

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

            {/* Employee */}
            <div className="grid grid-cols-2 gap-6 text-sm border-y border-border py-4">
              <div>
                <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">Employee</div>
                <div className="font-semibold text-ink text-base">{p.name}</div>
                <div className="text-inkSoft capitalize">{p.pay_type} pay</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">Hours recorded</div>
                <div className="text-ink">{p.hours != null && n(p.hours) > 0 ? `${n(p.hours).toFixed(2)} hrs` : "—"}</div>
                {p.account_name ? <div className="text-inkSoft text-xs mt-1">Paid via {p.account_name}</div> : null}
              </div>
            </div>

            {/* Earnings + Deductions */}
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">Earnings</div>
                <table className="w-full text-sm">
                  <tbody>
                    {earnings.map(([label, amt]) => (
                      <tr key={label}>
                        <td className="py-1 text-inkSoft">{label}</td>
                        <td className="py-1 text-right tabular-nums text-ink">{formatPHP(amt)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold">
                      <td className="py-1.5 text-ink">Gross salary</td>
                      <td className="py-1.5 text-right tabular-nums text-ink">{formatPHP(gross)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">Deductions</div>
                <table className="w-full text-sm">
                  <tbody>
                    {deductions.map(([label, amt]) => (
                      <tr key={label}>
                        <td className="py-1 text-inkSoft">{label}</td>
                        <td className="py-1 text-right tabular-nums text-ink">{amt ? `− ${formatPHP(amt)}` : formatPHP(0)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold">
                      <td className="py-1.5 text-ink">Total deductions</td>
                      <td className="py-1.5 text-right tabular-nums text-ink">{totalDed ? `− ${formatPHP(totalDed)}` : formatPHP(0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Net */}
            <div className="flex items-center justify-between bg-cream rounded-lg px-4 py-3">
              <span className="font-serif font-bold text-lg text-ink">Net pay</span>
              <span className="font-bold text-xl text-ink tabular-nums">{formatPHP(n(p.net_amount))}</span>
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
