"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function HubSignOut() {
  const router = useRouter();
  async function out() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button type="button" onClick={out} className="inline-flex items-center gap-2 text-sm font-medium text-inkSoft hover:text-ink">
      <LogOut className="w-4 h-4" /> Switch user
    </button>
  );
}
