import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_ROLES, type Role } from "@/lib/roles";
import { formatPHP } from "@/lib/utils";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-US", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}

type Slip = { token: string; label: string; period_start: string; period_end: string; pay_date: string; net_amount: number | string };

export default async function MyPayslipsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  const role = (roleRow?.role as Role | null) ?? null;
  if (!role || !TRACKER_ROLES.includes(role)) redirect("/dashboard");

  const { data } = await supabase.rpc("my_payslips");
  const slips = (data ?? []) as Slip[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-ink">My Payslips</h1>
        <p className="text-sm text-inkSoft mt-1">Your approved payslips. Open one to view or save it as a PDF.</p>
      </div>

      {slips.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-8 text-center text-sm text-inkSoft">
          No payslips yet. They&rsquo;ll appear here once a pay run you&rsquo;re in is approved.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Pay period</th>
                <th className="text-left font-semibold px-4 py-2">Pay date</th>
                <th className="text-right font-semibold px-4 py-2">Net pay</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slips.map((s) => (
                <tr key={s.token} className="hover:bg-cream/40">
                  <td className="px-4 py-2.5 font-medium text-ink">{fmt(s.period_start)} – {fmt(s.period_end)}</td>
                  <td className="px-4 py-2.5 text-inkSoft">{fmt(s.pay_date)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">{formatPHP(Number(s.net_amount))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <a href={`/payslip/${s.token}`} target="_blank" rel="noopener noreferrer" className="text-berry hover:underline inline-flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
