import { SettingsSubNav } from "../settings/settings-nav";

// Team lives at /dashboard/team (owner-only, the page gates it) but sits
// under Settings in the nav, so it shares the Settings tab bar.
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SettingsSubNav role="owner" />
      {children}
    </div>
  );
}
