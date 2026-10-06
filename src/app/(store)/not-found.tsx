import { Btn, Container } from "./_components/ui";

export default function StoreNotFound() {
  return (
    <Container className="pt-24 md:pt-32 pb-12">
      <p className="text-sm font-semibold text-s-muted">Page not found</p>
      <h1 className="mt-3 font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg max-w-[16ch]">
        We couldn&apos;t find that page.
      </h1>
      <p className="mt-5 text-lg text-s-muted max-w-[44ch]">The link may be old, or the event has already happened.</p>
      <div className="mt-9 flex flex-wrap gap-2">
        <Btn href="/shop" arrow>
          Shop packs
        </Btn>
        <Btn href="/events" variant="quiet">
          Upcoming events
        </Btn>
      </div>
    </Container>
  );
}
