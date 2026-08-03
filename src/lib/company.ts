// Seller identity shown on bills/invoices (the "from" side). Registered name
// and TIN are placeholders — confirm/replace with the real registered details.
// Kept here as a single source of truth so the invoice and, later, the emailed
// bill stay in sync.
export const COMPANY = {
  brandName: "Not Just Juice",
  registeredName: "NotJust Enterprises Inc.",
  tin: "684-322-008-00000",
  address: "Lot 4 Osmeña Village, Casuntingan, Mandaue City, Philippines 6000",
  email: "notjustgroup@gmail.com",
  logoSrc: "/just-juice-logo.png",
} as const;
