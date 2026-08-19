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

  // Corporate payment details shown in the invoice "Pay to" block. Fill these
  // in to make the section appear (it's hidden while bankName/accountNumber are
  // blank). altPayment is an optional 2nd line (e.g. a GCash number).
  bankName: "", // e.g. "RCBC"
  accountName: "", // e.g. "NotJust Enterprises Inc."
  accountNumber: "", // e.g. "1234567890"
  altPayment: "", // optional, e.g. "GCash: 0917 123 4567"
  // Path to a payment QR image placed in /public (e.g. "/pay-qr.png"). Leave
  // blank until the QR image is added; the QR only renders when set.
  payQrSrc: "",
} as const;
