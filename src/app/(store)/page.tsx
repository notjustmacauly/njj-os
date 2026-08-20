import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type CatalogItem } from "./_components/product-card";
import { flavorArt } from "./_components/flavor";

export const dynamic = "force-dynamic";

export default async function StoreHome() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("web_catalog")
    .select("*")
    .order("sort_order", { ascending: true });
  const items = (data ?? []) as CatalogItem[];

  // One "can" per flavour for the hero cluster.
  const heroFlavors = [
    { sku: "PCL", label: "Pineapple Cucumber Lemon" },
    { sku: "WPM", label: "Watermelon Passionfruit Mint" },
    { sku: "ACG", label: "Apple Carrot Grape" },
  ];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* animated colour depth */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-salmonBg via-cream to-cream" />
          <div className="absolute -top-40 -left-32 w-[40rem] h-[40rem] rounded-full bg-[#FBE7A1] opacity-60 blur-3xl" />
          <div className="absolute -top-20 right-[-10rem] w-[34rem] h-[34rem] rounded-full bg-[#E7B3C6] opacity-55 blur-3xl" />
          <div className="absolute bottom-[-12rem] left-1/4 w-[36rem] h-[36rem] rounded-full bg-[#8FD3B6] opacity-45 blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-8 items-center pt-16 pb-20 lg:pt-24 lg:pb-28">
          {/* Copy */}
          <div className="njj-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-3.5 py-1.5 text-xs font-semibold uppercase tracking-smallcaps text-berry">
              Cold-pressed · No added sugar
            </span>
            <h1 className="font-display font-semibold text-ink leading-[0.98] tracking-tight mt-5 text-5xl sm:text-6xl lg:text-7xl">
              Juice that
              <br />
              makes you{" "}
              <span className="italic text-berry">glow.</span>
            </h1>
            <p className="mt-6 text-lg text-inkSoft max-w-md">
              Real fruit, cold-pressed into 355&nbsp;ml cans. Pick a 4-pack or a
              7-day set and we&rsquo;ll bring the glow to your door.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/shop"
                className="group inline-flex items-center gap-2 rounded-full bg-berry text-white font-semibold px-7 py-3.5 hover:bg-berryLt transition shadow-lg shadow-berry/20"
              >
                Shop the juices
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
              </Link>
              <Link
                href="/#about"
                className="inline-flex items-center rounded-full bg-white/70 backdrop-blur text-ink font-semibold px-6 py-3.5 hover:bg-white transition"
              >
                Our story
              </Link>
            </div>
          </div>

          {/* Floating cans */}
          <div className="relative h-[22rem] sm:h-[26rem] lg:h-[30rem]">
            <div className="absolute inset-0" style={{ perspective: "1000px" }}>
              {heroFlavors.map((f, i) => {
                const art = flavorArt(f.sku);
                const pos = [
                  "left-[6%] top-[18%] rotate-[-8deg] z-10",
                  "left-1/2 -translate-x-1/2 top-0 z-20 scale-110",
                  "right-[6%] top-[22%] rotate-[8deg] z-10",
                ][i];
                const anim = ["njj-floaty", "njj-floaty-slow", "njj-floaty"][i];
                return (
                  <div key={f.sku} className={`absolute ${pos}`}>
                    <div className={anim}>
                      <div
                        className={`w-32 sm:w-40 h-56 sm:h-72 rounded-[2rem] bg-gradient-to-b ${art.gradient} shadow-2xl ring-1 ring-white/50 flex flex-col items-center justify-between py-6`}
                      >
                        <span className="text-3xl sm:text-4xl" aria-hidden>
                          {art.emoji}
                        </span>
                        <span className="px-3 text-center font-display font-semibold text-ink/70 text-xs sm:text-sm leading-tight">
                          {f.label}
                        </span>
                        <span className="w-14 h-1.5 rounded-full bg-white/60" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Product rail ─────────────────────────────────────── */}
      {items.length > 0 ? (
        <section className="py-14 sm:py-20">
          <div className="max-w-7xl mx-auto px-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-ink text-3xl sm:text-4xl">
                Grab a pack
              </h2>
              <p className="text-inkSoft mt-1">Freshly pressed, delivered cold.</p>
            </div>
            <Link
              href="/shop"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-berry hover:underline"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="njj-noscroll mt-7 flex gap-5 overflow-x-auto snap-x snap-mandatory px-6 pb-2 scroll-px-6">
            {items.map((item) => (
              <div key={item.id} className="snap-start shrink-0 w-[68vw] sm:w-72">
                <ProductCard item={item} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── About ────────────────────────────────────────────── */}
      <section id="about" className="scroll-mt-24 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="relative order-2 lg:order-1">
            {/* Photo placeholder — swap for a real lifestyle shot */}
            <div className="aspect-[4/5] rounded-[2.5rem] bg-gradient-to-br from-[#F7A9B0] via-[#FBE7A1] to-[#8FD3B6] shadow-xl ring-1 ring-white/40 flex items-center justify-center">
              <span className="text-7xl" aria-hidden>🧃</span>
            </div>
            <div className="njj-floaty absolute -bottom-6 -right-4 bg-white rounded-2xl shadow-xl px-5 py-4">
              <div className="font-display font-bold text-2xl text-berry">100%</div>
              <div className="text-xs text-inkSoft">real fruit, nothing else</div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-xs uppercase tracking-smallcaps font-semibold text-berry">
              Our story
            </span>
            <h2 className="font-display font-semibold text-ink text-3xl sm:text-5xl leading-tight mt-3">
              Small batches. Big glow.
            </h2>
            <p className="mt-5 text-lg text-inkSoft leading-relaxed">
              We started Not Just Juice with one belief: what goes into your body
              should be simple and honest. Every can is cold-pressed from real
              fruit — no concentrate, no added sugar, no shortcuts.
            </p>
            <p className="mt-4 text-inkSoft leading-relaxed">
              Pressed fresh, delivered cold, and made to make your everyday feel a
              little brighter.
            </p>
          </div>
        </div>
      </section>

      {/* ── Events / Community / Partners ────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          <TeaserCard
            id="events"
            eyebrow="Events"
            title="Catch us out there"
            body="Pop-ups, markets, and fresh-pressed moments around the city. Event booking is coming soon."
            gradient="from-[#FBE7A1] to-[#F7A9B0]"
          />
          <TeaserCard
            id="community"
            eyebrow="Community"
            title="Join the glow"
            body="Recipes, wellness tips, and the people behind the press. Be the first to know what's next."
            gradient="from-[#E7B3C6] to-[#8FD3B6]"
          />
          <TeaserCard
            id="partners"
            eyebrow="Partners"
            title="Stock Not Just Juice"
            body="Cafés, studios, and offices — bring cold-pressed juice to your space. Let's talk."
            gradient="from-[#8FD3B6] to-[#FBE7A1]"
            cta={{ label: "Get in touch", href: "mailto:notjustgroup@gmail.com" }}
          />
        </div>
      </section>
    </>
  );
}

function TeaserCard({
  id,
  eyebrow,
  title,
  body,
  gradient,
  cta,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  gradient: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div
      id={id}
      className="scroll-mt-24 relative overflow-hidden rounded-3xl bg-white ring-1 ring-border p-6 flex flex-col"
    >
      <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br ${gradient} opacity-70 blur-2xl`} />
      <span className="relative text-xs uppercase tracking-smallcaps font-semibold text-berry">
        {eyebrow}
      </span>
      <h3 className="relative font-display font-semibold text-ink text-2xl mt-2">
        {title}
      </h3>
      <p className="relative text-inkSoft mt-2 flex-1">{body}</p>
      {cta ? (
        <a
          href={cta.href}
          className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-berry hover:underline"
        >
          {cta.label} <ArrowRight className="w-4 h-4" />
        </a>
      ) : (
        <span className="relative mt-4 text-sm font-semibold text-inkSoft/70">
          Coming soon
        </span>
      )}
    </div>
  );
}
