import Link from "next/link";
import Image from "next/image";
import { COMPANY } from "@/lib/company";
import { Container } from "./ui";

const LINKS: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Events", href: "/events" },
  { label: "Community", href: "/#community" },
  { label: "Partners", href: "/#partners" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-s-line/[0.08]">
      <Container className="py-14 grid gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="space-y-4">
          <span className="inline-flex h-11 rounded-full bg-s-brand px-5 items-center">
            <Image src="/just-juice-wordmark.png" alt={COMPANY.brandName} width={2720} height={660} className="h-5 w-auto" />
          </span>
          <p className="text-s-muted max-w-[32ch]">Cold-pressed juice with high-protein collagen, delivered fresh.</p>
        </div>
        <nav aria-label="Footer" className="grid gap-2 content-start">
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="w-fit text-s-fg/80 hover:text-s-fg transition">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="grid gap-2 content-start text-s-fg/80">
          <a href={`mailto:${COMPANY.email}`} className="w-fit hover:text-s-fg transition">
            {COMPANY.email}
          </a>
          <p className="text-s-muted max-w-[30ch]">{COMPANY.address}</p>
        </div>
      </Container>
      <Container className="py-6 border-t border-s-line/[0.06] flex flex-wrap justify-between gap-2 text-xs text-s-muted">
        <span>
          © {new Date().getFullYear()} {COMPANY.registeredName}
        </span>
        <span>TIN {COMPANY.tin}</span>
      </Container>
    </footer>
  );
}
