"use client";

import * as React from "react";
import { registerServiceWorker, pushSupported } from "@/lib/push";

/** Registers the push service worker once on the client. Renders nothing. */
export function RegisterSW() {
  React.useEffect(() => {
    if (pushSupported()) {
      void registerServiceWorker();
    }
  }, []);
  return null;
}
