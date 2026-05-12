# NJJ OS v2

Internal operations app for NotJust Enterprises Inc. Next.js 14 + Supabase.

> **Phase 2a (this scaffold):** working login + dashboard skeleton with role-aware nav.
> Module pages (orders, POS, tickets, finance, partners, settings) come in Phase 2b.

---

## Quick start

### 1. Get the anon key from Supabase

1. Open https://supabase.com/dashboard/project/hatqqguxdezdhlocffqc/settings/api
2. Find the **`anon` `public`** key (NOT the service role key) — it starts with `eyJ...`. Copy it.

### 2. Local environment

```bash
cd v2
cp .env.local.example .env.local
# Open .env.local and paste the anon key after NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### 3. Install + run

```bash
npm install
npm run dev
# → opens http://localhost:3000
```

Sign in with the email + password you set in Supabase (`notjustmacauly@gmail.com`).
You should land on `/dashboard` and see the role-aware sidebar.

### 4. Generate TypeScript types from the schema (recommended)

Run this any time the schema changes:

```bash
npx supabase login            # one-time, uses your Supabase account
npm run gen:types             # writes src/types/database.ts
```

---

## Deploying to Netlify

### Option A — connect GitHub repo (recommended)

1. Push this repo to GitHub: `git push origin main`.
2. https://app.netlify.com → **Add new site → Import an existing project → GitHub** → pick `notjustmacauly/njj-os`.
3. **Build settings:**
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Functions directory: leave default
4. **Environment variables** (Site settings → Environment variables → Add a variable):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://hatqqguxdezdhlocffqc.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (the same anon key from Supabase)
5. Deploy. Netlify auto-rebuilds on every push to `main`.
6. (When ready) Connect your custom domain `notjustos.netlify.app` in **Domain management**.

### Option B — manual deploy

```bash
npm run build
# Drag the .next folder onto https://app.netlify.com/drop
```

Less repeatable; use only for one-off pushes.

---

## Project structure

```
v2/
├── package.json                  # deps + scripts
├── tsconfig.json                 # TypeScript config
├── next.config.mjs               # Next.js config
├── tailwind.config.ts            # Tailwind palette + content paths
├── postcss.config.mjs            # PostCSS
├── .env.local.example            # template — copy to .env.local
├── .gitignore                    # excludes node_modules, .next, .env files
├── README.md                     # this file
└── src/
    ├── middleware.ts             # auth refresh + protected-route gate
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts         # browser-side Supabase client
    │   │   ├── server.ts         # server-component Supabase client
    │   │   └── middleware.ts     # session-refresh helper
    │   └── utils.ts              # cn() + formatPHP() + formatDate()
    ├── app/
    │   ├── layout.tsx            # root HTML + body
    │   ├── globals.css           # Tailwind + base styles
    │   ├── page.tsx              # / — redirects to /login or /dashboard
    │   ├── login/
    │   │   ├── page.tsx          # /login — login screen
    │   │   └── login-form.tsx    # client component for the form
    │   └── dashboard/
    │       ├── layout.tsx        # /dashboard — wraps with sidebar
    │       ├── sidebar.tsx       # role-aware nav
    │       └── page.tsx          # /dashboard home — KPI cards
    ├── components/               # shared UI (added as needed)
    └── types/                    # generated database.ts goes here
```

---

## Architecture notes

- **Auth:** Supabase Auth, email + password. Session in HTTP-only cookies via `@supabase/ssr`. Middleware refreshes tokens on every request.
- **Authorization:** Postgres RLS policies enforce who can read/write what. The frontend trusts whatever the DB returns — no parallel permission logic.
- **Reads:** Server Components fetch via `createClient()` from `lib/supabase/server.ts`. RLS sees `auth.uid()` from the cookie.
- **Writes:** Mutations go through Postgres RPCs (e.g. `create_order`, `mark_bill_paid`, `ledger_apply`). Each RPC is atomic + idempotent.
- **Realtime:** Phase 2b will subscribe to `notifications` for in-app push.

See `../docs/` for the design docs — `ROADMAP.md`, `ARCHITECTURE.md`, `SCHEMA.md`, `AUTH.md`, `WIX_INTEGRATION.md`, `IMPROVEMENTS.md`.

---

## Phase 2b — what's next

Module pages, in priority order:

1. **Partners** — list + add/edit form. Validates the patterns end-to-end.
2. **Orders** — daily driver. Order entry form with line-item picker, status updates, delete.
3. **Production** — batches list, batch entry form with ingredients picker, COGS auto-display.
4. **POS** — touch-friendly booth UI. Open shift → sell items → close shift.
5. **Tickets** — list, manual entry, QR scanner for check-in.
6. **Finance** — Expenses / Receivables / Bills / Payments / Ledger view (read-only).
7. **Settings** — manage team users + their roles, edit ingredients, edit ticket types, set account opening balances.

Each module follows the same recipe: list page (server component, RLS-aware) → form (client component) → action wired to Postgres RPC.
