-- Applied 2026-08-15. Kept here so the database's shape is in the repo
-- and not only in Supabase.
--
-- The anon key ships inside the browser bundle by design, so with these
-- tables open anyone could read or delete 747 guests and 455 payments
-- through the REST API without ever loading the app. A password on the
-- page never stood in the way of that.

alter table public.guests   enable row level security;
alter table public.rooms    enable row level security;
alter table public.bookings enable row level security;

-- finance_entries and payments had RLS enabled but with a policy that
-- granted everything to everyone, which amounts to the same thing.
drop policy if exists "open access" on public.finance_entries;
drop policy if exists "open access" on public.payments;

create policy "authenticated full access" on public.guests
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.rooms
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.bookings
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.finance_entries
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.payments
  for all to authenticated using (true) with check (true);
