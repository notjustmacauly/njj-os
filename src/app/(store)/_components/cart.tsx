"use client";

import * as React from "react";

// One pack in the cart. Prices here are for display only — the server
// re-prices every pack from web_products at checkout.
export type CartLine = {
  key: string;
  product_id: string;
  slug: string;
  name: string;
  cans: number;
  deliveries: number;
  price: number;
  delivery_fee: number;
  mix: Record<string, number>; // per-delivery flavour counts
};

type CartCtx = {
  lines: CartLine[];
  ready: boolean;
  add: (line: Omit<CartLine, "key">) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "njj-cart-v1";
const Ctx = React.createContext<CartCtx | null>(null);

function load(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setLines(load());
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage blocked (private mode) — cart still works for this visit
    }
  }, [lines, ready]);

  const value = React.useMemo<CartCtx>(
    () => ({
      lines,
      ready,
      add: (line) =>
        setLines((ls) => [...ls, { ...line, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]),
      remove: (key) => setLines((ls) => ls.filter((l) => l.key !== key)),
      clear: () => setLines([]),
    }),
    [lines, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}

/** Mirrors the server: one delivery fee per delivery date (week). */
export function cartTotals(lines: CartLine[]) {
  const subtotal = lines.reduce((a, l) => a + l.price, 0);
  const weeks = lines.reduce((a, l) => Math.max(a, l.deliveries), 0);
  let delivery = 0;
  for (let w = 1; w <= weeks; w++) {
    const fees = lines.filter((l) => l.deliveries >= w).map((l) => l.delivery_fee);
    delivery += fees.length ? Math.max(...fees) : 0;
  }
  return { subtotal, delivery, weeks, total: subtotal + delivery };
}
