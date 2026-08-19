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

  // Corporate payment details shown in the invoice "Pay to" block. Each entry
  // is a labelled account. The section is hidden when the list is empty.
  paymentAccounts: [
    {
      label: "Check payments",
      bank: "RCBC / DiskarTech",
      accountName: "NotJust Enterprises Inc.",
      accountNumber: "75 9142 0257",
    },
    {
      label: "Bank transfers",
      bank: "RCBC / DiskarTech",
      accountName: "Macauly Gary Gosta S. Lofgren",
      accountNumber: "75 9129 7137",
    },
  ],
  // Path to a payment QR image placed in /public. Leave blank to hide the QR.
  // InstaPay QR (interoperable — scannable by GCash, Maya, and bank apps).
  payQrSrc: "/pay-qr.jpg",
} as const;
