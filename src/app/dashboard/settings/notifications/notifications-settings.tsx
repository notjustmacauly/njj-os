"use client";

import * as React from "react";
import { Bell, Mail, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import {
  pushSupported,
  isSubscribed,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/lib/push";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
        (checked ? "bg-berry" : "bg-border") +
        (disabled ? " opacity-50 cursor-not-allowed" : "")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition " +
          (checked ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}

export function NotificationsSettings({
  initialEmailEnabled,
  initialPushEnabled,
}: {
  initialEmailEnabled: boolean;
  initialPushEnabled: boolean;
}) {
  const toast = useToast();
  const [emailEnabled, setEmailEnabled] = React.useState(initialEmailEnabled);
  const [pushEnabled, setPushEnabled] = React.useState(initialPushEnabled);
  const [deviceOn, setDeviceOn] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setSupported(pushSupported());
    void isSubscribed().then(setDeviceOn);
  }, []);

  async function savePref(patch: { email_enabled?: boolean; push_enabled?: boolean }) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("notification_prefs").upsert(
      {
        user_id: user.id,
        email_enabled: patch.email_enabled ?? emailEnabled,
        push_enabled: patch.push_enabled ?? pushEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) toast.push("Couldn't save — try again", "error");
    else toast.push("Saved", "success");
  }

  async function onToggleEmail(v: boolean) {
    setEmailEnabled(v);
    await savePref({ email_enabled: v });
  }

  async function onTogglePush(v: boolean) {
    setPushEnabled(v);
    await savePref({ push_enabled: v });
  }

  async function onEnableDevice() {
    setBusy(true);
    const res = await subscribeThisDevice();
    setBusy(false);
    if (res.ok) {
      setDeviceOn(true);
      toast.push("This device will now get push alerts", "success");
    } else {
      const messages: Record<string, string> = {
        unsupported:
          "This browser can't do push. On iPhone, add the app to your Home Screen first, then open it from there.",
        denied: "Notifications are blocked. Enable them for this site in your browser settings.",
        "not-configured": "Push isn't configured yet on the server.",
        "no-sw": "Couldn't start the background worker. Reload and try again.",
        "no-user": "You're signed out. Sign in and try again.",
      };
      toast.push(messages[res.reason] ?? "Couldn't enable push", "error");
    }
  }

  async function onDisableDevice() {
    setBusy(true);
    await unsubscribeThisDevice();
    setBusy(false);
    setDeviceOn(false);
    toast.push("This device will no longer get push alerts", "info");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
          <Bell className="w-7 h-7 text-berry" />
          Notifications
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Choose how you want to be told about things like payment approvals.
        </p>
      </header>

      {/* Email */}
      <section className="bg-white border border-border rounded-lg p-5 flex items-start gap-4">
        <Mail className="w-5 h-5 text-berry mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold text-ink">Email notifications</h2>
            <Toggle checked={emailEnabled} onChange={onToggleEmail} label="Email notifications" />
          </div>
          <p className="text-sm text-inkSoft mt-1">
            Get an email at your account address when something needs your attention.
          </p>
        </div>
      </section>

      {/* Push (master pref) */}
      <section className="bg-white border border-border rounded-lg p-5 flex items-start gap-4">
        <Smartphone className="w-5 h-5 text-berry mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold text-ink">Phone push notifications</h2>
            <Toggle checked={pushEnabled} onChange={onTogglePush} label="Push notifications" />
          </div>
          <p className="text-sm text-inkSoft mt-1">
            Banner alerts on your phone, even when the app is closed. Keep this on, then
            enable each device you want alerts on below.
          </p>

          <div className="mt-4 border-t border-border pt-4">
            {!supported ? (
              <p className="text-sm text-inkSoft">
                This device/browser doesn&apos;t support push.{" "}
                <span className="text-ink font-medium">
                  On iPhone: open in Safari, tap Share → Add to Home Screen, then open the app
                  from your Home Screen and come back here.
                </span>
              </p>
            ) : deviceOn ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-green font-medium">
                  ✓ This device is getting push alerts
                </span>
                <button
                  type="button"
                  onClick={onDisableDevice}
                  disabled={busy}
                  className="text-sm font-semibold text-inkSoft hover:text-ink underline disabled:opacity-50"
                >
                  Turn off on this device
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onEnableDevice}
                disabled={busy || !pushEnabled}
                className="bg-berry text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-berry/90 disabled:opacity-50"
              >
                {busy ? "Enabling…" : "Enable push on this device"}
              </button>
            )}
            {!pushEnabled && supported && !deviceOn ? (
              <p className="text-xs text-inkSoft mt-2">
                Turn the toggle above on first.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
