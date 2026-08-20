import Link from "next/link";
import { COMPANY } from "@/lib/company";

const LINKS: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Events", href: "/#events" },
  { label: "Community", href: "/#community" },
  { label: "Partners", href: "/#partners" },
];

export function SiteFooter() {
  return (
    <footer className="mt-6 bg-brandpink text-white">
      <div className="max-w-7xl mx-auto px-6 py-14 grid gap-10 sm:grid-cols-3">
        <div className="space-y-2">
          <div className="font-display text-2xl font-semibold">{COMPANY.brandName}</div>
          <p className="text-white/80">Cold-pressed juice, delivered fresh.</p>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-white/70">
            Explore
          </div>
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="block text-white/90 hover:text-white transition">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-white/70">
            Contact
          </div>
          <a href={`mailto:${COMPANY.email}`} className="block text-white/90 hover:text-white transition">
            {COMPANY.email}
          </a>
          <p className="text-white/80">{COMPANY.address}</p>
        </div>
      </div>
      <div className="border-t border-white/20">
        <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-white/80 flex flex-wrap items-center justify-between gap-2">
          <span>© {COMPANY.registeredName}</span>
          <span>TIN {COMPANY.tin}</span>
        </div>
      </div>
    </footer>
  );
}
