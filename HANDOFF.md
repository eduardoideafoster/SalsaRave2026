# SalsaRave 2026 — Project Handoff

Onboarding doc for a fresh Claude session on this repo. Read once, then operate.

---

## 1. What this is

Internal hotel/finance management web app for **SalsaRave 2026** (salsa dance festival, Hotels H3 + H4, Sep 10-14 2026).

Built features:
- **Guests tab** — attendees list, filters (hotel, role, country, ticket, tribe, etc.), edit modal.
- **Rooms tab** — room inventory (101-339 H3 + 50 H4 doubles), bulk edit, click room to manage occupants.
- **Availability tab** — daily occupancy chart, check-in/check-out details per day.
- **Statistics tab** — counts, role distribution, country chart, room-sharing stats.
- **Finance dashboard** (`/finance`, password-gated) — XLSX importer, hotel-cost vs paid-revenue card, manual entries.

All UI is **bilingual EN/ES**, language toggle in top-right.

---

## 2. Working agreement (from CLAUDE.md)

- **Autonomy:** operate directly. Don't ask before editing code, running scripts, committing, pushing, deploying. Exceptions: destructive prod-data ops outside task scope, anything requiring the user's own auth flow (`vercel login`, Supabase dashboard).
- **Language:** user writes Spanish, **reply in Spanish**. Code/commits/PR descriptions in English.
- **Deploy workflow** (don't re-explain each time):
  1. `pnpm build` to verify locally
  2. `git add -A && git -c user.email="eduardo@ideafoster.com" -c user.name="eduardoideafoster" commit -m "..."`
  3. `git push`
  4. `vercel deploy --prod --yes`
  5. `vercel alias set <new-url> salsarave-rooming-2026.vercel.app`
- **Commit author email MUST be `eduardo@ideafoster.com`** — the `ideafoster` Vercel team seat-block rejects any other email with a generic "deploy_failed" (empty error message).
- **Preview server:** the Claude Preview MCP is bound to a different project (`zastur-development`). Don't start a preview server from here — verify via Vercel prod deploy.

---

## 3. Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19**, TypeScript
- **Tailwind** + **Radix UI** + **lucide-react** icons
- **Supabase** (Postgres + auth-via-cookie for /finance only, anon key on browser)
- **pnpm** (not npm/yarn)
- **Vercel** prod (team: `ideafoster`, project: `salsarave-fresh`)
- **xlsx** (SheetJS) for parsing payment exports server-side

---

## 4. Repo layout (what matters)

```
app/
  page.tsx                 — main hotel mgmt page (tabs)
  layout.tsx               — root, wraps in LanguageProvider
  finance/
    page.tsx               — finance dashboard
    layout.tsx             — force-dynamic (avoids prerender w/o anon key)
    actions.ts             — server actions: importPaymentsXlsx
    login/
      page.tsx             — password login form
      actions.ts           — login/logout server actions
components/                — top-nav, guests-tab, rooms-tab, availability-tab,
                             statistics-tab, dialogs (assign-room, room-detail,
                             guest-edit, room-edit)
lib/
  types.ts                 — Guest, Room, Booking, Tribe, Tab
  i18n.tsx                 — LanguageProvider + useT() + dictionaries (en/es)
  supabase/
    client.ts              — createBrowserClient (uses NEXT_PUBLIC_SUPABASE_ANON_KEY)
    server.ts              — createServerClient (cookies-based)
  finance/
    hotel-cost.ts          — computeHotelCost(bookings, rooms) → cost breakdown
  utils.ts, csv.ts
scripts/
  001_create_hotel_tables.sql   — STALE, don't trust columns here
  _payments_schema.sql          — current payments table DDL
  _finance_schema.sql           — finance_entries DDL
  *.mjs / *.ts                  — one-off import/restore/diff scripts
middleware.ts              — gates /finance behind cookie auth
```

---

## 5. Database schema (current, live)

Don't trust `001_create_hotel_tables.sql` (it's the initial migration; many columns were dropped/renamed).

### `guests`
```ts
{
  id: uuid PK,
  order_code: text,
  full_name: text,
  role: 'Leader' | 'Follower' | 'Both',
  country: text | null,
  ticket_type: text,
  hotel: 'H3' | 'H4' | null,    // null = RAVEPASS (no accommodation)
  check_in_date: date | null,
  check_out_date: date | null,
  tribe: text | null,            // one of TRIBES in lib/types.ts
  created_at, updated_at
}
```

### `rooms`
```ts
{
  id: uuid PK,
  room_number: text UNIQUE,      // H3: 101-139, 201-239, 301-338; H4: H4-01..H4-50
  hotel: 'H3' | 'H4',
  room_type: 'single' | 'double' | 'triple' | 'quadruple',
  capacity: int,
  available_from: date,          // date the room becomes bookable
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning',
  is_staff: bool,                // staff/Core Tribe room
  notes: text | null,
  created_at, updated_at
}
```
No pricing columns on `rooms` — rates live in code (see §7).

### `bookings`
```ts
{
  id: uuid PK,
  guest_id: uuid FK guests,
  room_id: uuid FK rooms,
  check_in_date: date,
  check_out_date: date,           // exclusive
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled',
  notes: text | null,
  created_at, updated_at
}
```

### `finance_entries` (manual)
```ts
{
  id: uuid PK,
  type: 'income' | 'expense',
  category: text,                 // see CATEGORIES_* in app/finance/page.tsx
  description: text | null,
  amount_eur: numeric,
  date: date,
  created_at
}
```

### `payments` (auto-imported)
```ts
{
  locator: bigint,                // Eventbrite locator (positive) or synthetic (negative) for slim imports
  attendee_index: int,            // 1..N within an order
  order_code: text,
  sale_date: timestamptz | null,
  status: text | null,
  ticket: text,
  sale_type: text | null,         // 'manual' for slim imports
  price_eur: numeric,
  full_name, email, phone, role, country,
  imported_at: timestamptz,
  PRIMARY KEY (locator, attendee_index)
}
```
RLS open on all tables. The app uses the anon key from the browser.

---

## 6. Auth / `/finance`

- `middleware.ts` checks a cookie set by `app/finance/login/actions.ts` (compares against `FINANCE_PASSWORD` env on the server). Cookie name is something like `salsarave_finance`.
- `FINANCE_PASSWORD` is set in Vercel env, NOT in `.env.local`.
- Main app (`/`) has no auth.

---

## 7. Pricing model (hardcoded in `lib/finance/hotel-cost.ts`)

Contract rates per occupant per night:

| Hotel | Single | Double |
|-------|--------|--------|
| H3    | 82 €   | 57 €   |
| H4    | 102 €  | 77 €   |

Rules:
- A **single room** with exactly 1 occupant → single rate.
- Any other config (double/triple/quadruple, or single with >1) → double rate per occupant.
- **3rd and 4th occupants** of a room get **15% discount** (multiplied by 0.85).
- RavePass-only guests (no `bookings` row) → 0 € cost. Automatic.

`computeHotelCost(bookings, rooms)` returns `{ total, byHotel: { H3, H4 }, byRoomType: {...}, nights }`. Iterates per-night per-room and counts occupants per night.

**RavePass list price** = 135 €. Used by the slim XLSX importer as default per-attendee price.

---

## 8. XLSX import (`/finance` "Importar pagos XLSX")

`app/finance/actions.ts` → `importPaymentsXlsx(formData)` auto-detects two formats:

### Format A — Full Eventbrite/goandance Attendees export
Columns: `Locator, Order, Date, Status, Discount, Promoter, Ticket, Sale Type, Settlement, Price, Full name, Email, Phone, Role, Country, Scanned date, Scanned by`.

Behavior:
- One row per attendee. **Locator is per-ORDER** (shared across attendees of the same order).
- First attendee of an order has full `Price`; rest are 0 (sum still works).
- Computes `attendee_index` per-locator (1..N).
- **UPSERT** on `(locator, attendee_index)` — updates existing rows if re-imported.

### Format B — Slim Promoter Sales export
Columns: `Order, Ticket Type, Full name, Role, Country` (no Locator, no Price, no Date).

Behavior:
- Synthesizes a **negative** locator from `order_code` (base-36 of code, negated) — guarantees no collision with real positive Eventbrite locators.
- Default price 135 €/row (RavePass).
- **INSERT-ONLY by `order_code`**: if the `order_code` already exists in `payments`, the whole order is skipped. Existing data is never touched.

UI message: `[mode] X insertados · Y actualizados · Z ignorados (total €)`.

---

## 9. i18n

- `lib/i18n.tsx` — single-file `LanguageProvider` + `useT()` + `useLang()`. Dictionaries inline (`en`, `es`).
- Lang persists to `localStorage['salsarave_lang']`.
- Adding strings: add the key to BOTH dictionaries, then `t('your.key', { var: 'x' })`. Interpolation: `{var}`.
- `/finance` page has its own EN/ES toggle (not part of TopNav).

---

## 10. Environment variables

In Vercel (prod):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (only for migration scripts, not the app)
- `FINANCE_PASSWORD`

In local `.env.local`: same vars, mirrored from Vercel dashboard.

**Gotcha**: if `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_URL` are missing locally, `pnpm build` fails at prerender of `/` because the browser-client throws at module init. To build sandbox-only without real creds, you can append dummy values temporarily — but only as a verification trick. Don't commit dummies.

---

## 11. Known gotchas

1. **Vercel team seat-block**: commits authored by anything other than `eduardo@ideafoster.com` get deployed but Vercel returns a vague "deploy_failed". Always use `-c user.email="eduardo@ideafoster.com" -c user.name="eduardoideafoster"`.
2. **Preview MCP is bound elsewhere** — don't start preview server from this dir.
3. **Supabase Data API default change (May 30 / Oct 30 2026)**: only affects new projects (May) and new tables on existing projects after Oct 30. Add explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO anon, authenticated, service_role;` to any new table DDL created after Oct 30.
4. **Prerender of `/finance`** is disabled via `app/finance/layout.tsx` (`force-dynamic`). Don't remove this.
5. **Room numbering 2026**: H3 floors 1-3 = `101-139 / 201-239 / 301-338`; floor 4 staff; H4 = 50 doubles `H4-01..H4-50`.

---

## 12. Current state (when handing off)

- **Branch**: `claude/recreate-supabase-db-LiZsG` (all feature work here)
- **Latest commits**:
  - `c762dca` Support slim Attendees XLSX (Promoter Sales): insert-only by order_code
  - `c71ad77` i18n: bilingual /finance (EN + ES) with language toggle
  - `f2b1a54` Harden XLSX date parsing in payments import
  - `cc6cbcf` Fix payments PK: Locator is per-order, add attendee_index
  - `2969e66` Auto-compute hotel cost vs paid revenue in /finance
  - `d6acd5c` Add /finance dashboard behind password gate
- **Last deployed alias**: `salsarave-rooming-2026.vercel.app` → latest prod URL
- **Active concern**: just imported a slim RavePass XLSX (148 attendees, 117 orders, 19.980€ if all new); pending confirmation in UI.

---

## 13. How to resume

1. `git fetch && git checkout claude/recreate-supabase-db-LiZsG && pnpm install`
2. Make sure `.env.local` has the 4 env vars from §10 (copy from Vercel dashboard).
3. `pnpm build` to confirm.
4. Read `app/finance/page.tsx`, `app/finance/actions.ts`, and `lib/finance/hotel-cost.ts` first — newest area.
5. For DB changes: write SQL in `scripts/_<name>.sql`, then paste into Supabase SQL editor manually (user runs it). Don't push raw migration scripts to Vercel.

---

## 14. Commands cheatsheet

```bash
# Dev
pnpm dev

# Build (verify before deploy)
pnpm build

# Commit (note the email override)
git -c user.email="eduardo@ideafoster.com" -c user.name="eduardoideafoster" commit -m "..."

# Deploy
vercel deploy --prod --yes
vercel alias set <new-deployment-url> salsarave-rooming-2026.vercel.app
```
