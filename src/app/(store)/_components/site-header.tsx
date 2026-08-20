import Link from "next/link";
import Image from "next/image";
import { COMPANY } from "@/lib/company";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-cream/85 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0" aria-label={COMPANY.brandName}>
          <Image
            src={COMPANY.logoSrc}
            alt={COMPANY.brandName}
            width={160}
            height={80}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-semibold text-ink">
          <Link href="/shop" className="px-3 py-2 rounded-md hover:bg-creamDk transition">
            Shop
          </Link>
          <span
            className="px-3 py-2 rounded-md text-inkSoft/60 cursor-default"
            title="Coming soon"
          >
            Events
          </span>
          <Link
            href="/login"
            className="px-3 py-2 rounded-md text-inkSoft hover:text-ink transition hidden sm:inline"
          >
            Staff
          </Link>
        </nav>
      </div>
    </header>
  );
}
