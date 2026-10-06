"use client";

import * as React from "react";

/**
 * Fade-up on first entry into the viewport (IntersectionObserver, no scroll
 * listeners). Motion is CSS-only (.s-reveal in globals.css) and collapses to
 * static under prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-shown={shown}
      className={`s-reveal ${className}`}
      style={{ ["--s-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
