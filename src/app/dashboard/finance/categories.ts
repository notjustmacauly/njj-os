// Shared category list for Expenses, Payments, and Reimbursements forms.
// v1 only — Phase 3 will move this to a settings table so admins can edit
// without a deploy.

export const FINANCE_CATEGORIES = [
  "Production",
  "Human",
  "Logistics",
  "Event",
  "Marketing",
  "Utilities",
  "Rent",
  "R&D",
  "NJF",
  "Legal",
  "Taxes",
  "CSM",
  "Office",
  "Equipment",
  "Liabilities",
  "Misc",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];
