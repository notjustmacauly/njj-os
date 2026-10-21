import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { Reveal } from "../_components/reveal";
import { Container, Lede } from "../_components/ui";
import type { PassPrices } from "../events/[slug]/checkout/pass-checkout";
import { BuyBundle } from "./buy-bundle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pass bundles",
  description: "Every NotJust event pass is the same price. Buy a bundle of passes and use them at any event, for you or a friend.",
};

export default async function PassesPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("web_pass_prices");
  const p = (data ?? {}) as Partial<PassPrices>;
  const prices: PassPrices = { pass_price: Number(p.pass_price ?? 255), bundle_size: Number(p.bundle_size ?? 4), bundle_price: Number(p.bundle_price ?? 980) };
  const each = prices.bundle_price / prices.bundle_size;

  return (
    <Container className="pt-14 md:pt-20">
      <div className="grid gap-10 md:grid-cols-12 md:items-start">
        <Reveal className="md:col-span-6">
          <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">One pass, any event.</h1>
          <Lede className="mt-5">
            Every event pass is {formatPHP(prices.pass_price)}. Get {prices.bundle_size} for {formatPHP(prices.bundle_price)} ({formatPHP(each)} each) and use them whenever you like, for you or a friend. They never expire.
          </Lede>
          <ul className="mt-8 grid gap-3 text-s-fg">
            {[
              "Pick any badminton, pickleball or volleyball night.",
              "Book a spot for a friend with their name.",
              "Passes stay in your account until you use them.",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-s-fg" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <div className="md:col-span-6">
          <BuyBundle prices={prices} />
        </div>
      </div>
    </Container>
  );
}
