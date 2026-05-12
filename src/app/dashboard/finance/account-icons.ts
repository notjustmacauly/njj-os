// Hardcoded emoji per account name. v1 only — Phase 3 will move this to a
// column on the accounts table so admins can edit through Settings.

export function accountEmoji(code: string): string {
  const c = code.toLowerCase();
  if (c.includes("xendit")) return "🌐";
  if (c.includes("gcash")) return "📱";
  if (c.includes("cash")) return "💵";
  if (c.includes("rcbc") || c.includes("bdo") || c.includes("bpi") || c.includes("bank")) {
    return "🏦";
  }
  // Fallback for ad-hoc / unknown accounts.
  return "🏷️";
}
