import { redirect } from "next/navigation";

// Reimbursements share the payment detail page (handled by the shared client
// component which detects type='reimbursement' and surfaces the linked expense).
export default function ReimbursementDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/dashboard/finance/payments/${params.id}`);
}
