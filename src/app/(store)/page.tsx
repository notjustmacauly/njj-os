import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { PackTrio, type CatalogItem } from "./_components/product-card";
import { EventCard } from "./_components/event-card";
import type { PublicEvent } from "./_components/events";
import { flavorArt } from "./_components/flavor";
import { Reveal } from "./_components/reveal";
import { ArrowUpRightLine } from "./_components/icons";
import { Bezel, Btn, Container, H2, Lede } from "./_components/ui";

export const dynamic = "force-dynamic";

const FLAVOURS = ["PCL", "ACG", "WPM"] as const;
const FLAVOUR_NAMES: Record<(typeof FLAVOURS)[number], string> = {
  PCL: "Pineapple Cucumber Lemon",
  ACG: "Apple Carrot Grape",
  WPM: "Watermelon Passionfruit Mint",
};

export default async function StoreHome() {
  const supabase = await createClient();

  // Staff (anyone with an OS role) who lands on the public home, e.g. after
  // accepting a Supabase invite, goes to the dashboard.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (roleRow?.role) redirect("/dashboard");
  }

  const [{ data }, { data: eventRows }] = await Promise.all([
    supabase.from("web_catalog").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("web_events")
      .select("*")
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(6),
  ]);
  const items = (data ?? []) as CatalogItem[];
  const events = (eventRows ?? []) as PublicEvent[];

  return (
    <>
      {/* Hero: asymmetric split, real product photo */}
      <section className="pt-8 md:pt-12">
        <Container className="grid items-center gap-10 md:grid-cols-12 md:min-h-[calc(100dvh-9rem)]">
          <div className="md:col-span-6">
            <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.95] text-[3.25rem] sm:text-6xl xl:text-7xl text-s-fg [text-wrap:balance]">
              Juice that makes you glow.
            </h1>
            <Lede className="mt-6">
              Real fruit, cold-pressed into 330 ml cans with high-protein collagen. No added sugar. Delivered fresh to
              your door.
            </Lede>
            <div className="mt-9 flex flex-wrap items-center gap-2">
              <Btn href="/shop" arrow>
                Shop packs
              </Btn>
              <Btn href="/events" variant="quiet">
                Upcoming events
              </Btn>
            </div>
          </div>
          <div className="md:col-span-6">
            <Bezel>
              <div className="relative aspect-[4/3] md:aspect-[5/4]">
                <Image
                  src="/hero-shot.jpg"
                  alt="Not Just Juice cans in pineapple, apple and watermelon with a fresh fruit splash"
                  fill
                  priority
                  sizes="(max-width: 768px) 92vw, 760px"
                  className="object-cover object-[68%_center]"
                />
              </div>
            </Bezel>
          </div>
        </Container>
      </section>

      {/* Packs: asymmetric trio */}
      {items.length > 0 ? (
        <section className="py-24 md:py-32">
          <Container>
            <Reveal>
              <H2>Pick your pack.</H2>
              <Lede className="mt-4">Every pack comes in any mix of the three flavours. Same price, whatever you choose.</Lede>
            </Reveal>
            <Reveal delay={120} className="mt-12">
              <PackTrio items={items} />
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* Story: editorial statement over the three cans */}
      <section id="about" className="scroll-mt-28">
        <Container>
          <Reveal>
            <div className="rounded-[36px] bg-s-surface ring-1 ring-s-line/[0.07] px-6 py-14 sm:px-12 md:px-16 md:py-20">
              <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-6">
                  <H2 className="md:text-6xl">Small batches. Big glow.</H2>
                  <p className="mt-6 text-lg text-s-muted leading-relaxed max-w-[50ch]">
                    We started Not Just Juice with one belief: what goes into your body should be simple and honest. Every
                    can is cold-pressed from real fruit and boosted with high-protein collagen. No concentrate, no added
                    sugar, no shortcuts.
                  </p>
                  <dl className="mt-10 grid grid-cols-3 gap-4 max-w-md">
                    {[
                      ["100%", "real fruit"],
                      ["330 ml", "per can"],
                      ["0 g", "added sugar"],
                    ].map(([v, l]) => (
                      <div key={l}>
                        <dt className="sr-only">{l}</dt>
                        <dd className="font-display text-3xl font-semibold tracking-[-0.03em] text-s-fg">{v}</dd>
                        <dd className="text-sm text-s-muted">{l}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <ul className="lg:col-span-6 grid grid-cols-3 gap-3 sm:gap-5">
                  {FLAVOURS.map((code, i) => {
                    const art = flavorArt(code);
                    return (
                      <li key={code} className={i === 1 ? "lg:-translate-y-8" : ""}>
                        <div className={`relative aspect-[3/5] rounded-[24px] bg-gradient-to-b ${art.gradient}`}>
                          {art.can ? (
                            <Image
                              src={art.can}
                              alt={`${FLAVOUR_NAMES[code]} can`}
                              fill
                              sizes="(max-width: 768px) 30vw, 200px"
                              className="object-contain p-4 sm:p-6 drop-shadow-[0_20px_24px_rgb(18_18_18/0.22)]"
                            />
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-s-fg leading-snug">{FLAVOUR_NAMES[code]}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Community: upcoming events on a horizontal rail */}
      <section id="community" className="scroll-mt-28 py-24 md:py-32">
        <Container>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <H2>Come play with us.</H2>
              <Lede className="mt-4">Community games every week. One pass is ₱250 for one sport.</Lede>
            </div>
            {events.length > 0 ? (
              <Link href="/events" className="text-sm font-semibold text-s-fg underline underline-offset-4 decoration-s-line/30 hover:decoration-s-fg">
                See all events
              </Link>
            ) : null}
          </Reveal>
        </Container>
        {events.length > 0 ? (
          <Reveal delay={120} className="mt-12">
            <div className="njj-noscroll flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-1320px)/2+2rem))] scroll-px-5">
              {events.map((e) => (
                <div key={e.id} className="snap-start shrink-0 w-[82vw] sm:w-[380px]">
                  <EventCard event={e} />
                </div>
              ))}
            </div>
          </Reveal>
        ) : (
          <Container className="mt-10">
            <p className="text-s-muted">New dates are being added. Check back soon.</p>
          </Container>
        )}
      </section>

      {/* Partners: one brand-colour band */}
      <section id="partners" className="scroll-mt-28">
        <Container>
          <Reveal>
            <div className="relative overflow-hidden rounded-[36px] bg-s-brand text-s-brand-fg px-6 py-14 sm:px-12 md:px-16 md:py-20 grid gap-8 md:grid-cols-12 md:items-center">
              <div className="md:col-span-8">
                <h2 className="font-display font-semibold tracking-[-0.03em] leading-[1.02] text-4xl md:text-5xl [text-wrap:balance]">
                  Stock Not Just Juice.
                </h2>
                <p className="mt-4 text-lg leading-relaxed max-w-[48ch] text-s-brand-fg/75">
                  Cafés, studios and offices: bring cold-pressed juice to your space.
                </p>
              </div>
              <div className="md:col-span-4 md:justify-self-end">
                <a
                  href={`mailto:${COMPANY.email}?subject=${encodeURIComponent("Stocking Not Just Juice")}`}
                  className="group inline-flex items-center gap-3 rounded-full bg-[#121212] text-[#FAFAF8] pl-6 pr-1.5 py-1.5 font-semibold transition duration-300 ease-settle hover:bg-[#121212]/90 active:scale-[0.98]"
                >
                  Get in touch
                  <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center transition duration-300 ease-settle group-hover:translate-x-0.5 group-hover:-translate-y-px">
                    <ArrowUpRightLine className="w-4 h-4" />
                  </span>
                </a>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
