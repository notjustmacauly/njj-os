// App roles, mirroring the deployed app_role enum on the database side.
// Source of truth for who-sees-what: docs/specs/ROLE_ACCESS_MATRIX.md.
// `admin` and `ops` are retired (May 2026 cutover) — admin → owner,
// ops folded into manager.

export type Role = "owner" | "partner" | "manager" | "staff" | "marketing";

// Role-group constants used by page and component gates. Defined here so the
// matrix lives in one file — when the spec changes, the changes ripple through
// every gate that imports the appropriate constant.
//
// NOTE: `marketing` is a RESTRICTED office role — it is deliberately NOT in
// ALL_ROLES, so every existing gate (orders, finance, inventory, …) excludes
// it by default. Marketing is whitelisted only where explicitly listed
// (see TRACKER_ROLES) — Tasks, their dashboard, and their own profile/settings.

export const ALL_ROLES: readonly Role[] = ["owner", "partner", "manager", "staff"];
export const OWNER_ONLY: readonly Role[] = ["owner"];
export const OWNER_PARTNER: readonly Role[] = ["owner", "partner"];
export const OWNER_PARTNER_MANAGER: readonly Role[] = ["owner", "partner", "manager"];
// Office roles that use the task trackers / attendance / their own dashboard.
export const TRACKER_ROLES: readonly Role[] = ["owner", "partner", "manager", "staff", "marketing"];

export function hasRole(role: Role | null | undefined, allowed: readonly Role[]): boolean {
  return role != null && allowed.includes(role);
}
