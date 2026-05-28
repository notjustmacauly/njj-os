"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogRevenueModal } from "./log-revenue-modal";

export function LogRevenueLauncher({
  accounts,
  loggedByName,
}: {
  accounts: Array<{ code: string; name: string }>;
  loggedByName: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        Log revenue
      </Button>
      <LogRevenueModal
        open={open}
        onClose={() => setOpen(false)}
        accounts={accounts}
        loggedByName={loggedByName}
      />
    </>
  );
}
