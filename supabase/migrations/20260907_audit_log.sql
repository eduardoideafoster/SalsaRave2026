-- Applied 2026-09-07. A record of every change to guests, rooms and
-- bookings. Until now nothing tracked edits: bookings never wrote
-- updated_at at all, so moving someone's checkout from Sunday to Monday
-- left no trace, and the only other record — the server logs — keeps 24
-- hours and stores the row id, not the values.
--
-- Deliberately incapable of breaking a save: a new table nothing else
-- reads, AFTER triggers that cannot alter or block the write, and a
-- function whose body is wrapped so any failure inside it is swallowed
-- rather than aborting the user's transaction.

create table if not exists public.audit_log (
  id             bigserial primary key,
  changed_at     timestamptz not null default now(),
  table_name     text        not null,
  row_id         uuid,
  action         text        not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb,
  actor          text
);

create index if not exists audit_log_changed_at_idx on public.audit_log (changed_at desc);
create index if not exists audit_log_row_idx        on public.audit_log (table_name, row_id);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[];
  who     text;
begin
  begin
    who := coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      nullif(current_setting('request.jwt.claim.sub',   true), ''),
      current_user
    );

    if tg_op = 'UPDATE' then
      select array_agg(e.k)
        into changed
        from jsonb_each(to_jsonb(new)) as e(k, v)
       where e.v is distinct from (to_jsonb(old) -> e.k)
         and e.k <> 'updated_at';

      if changed is null then
        return null;
      end if;

      insert into public.audit_log
        (table_name, row_id, action, changed_fields, old_data, new_data, actor)
      values
        (tg_table_name, (to_jsonb(new) ->> 'id')::uuid, 'UPDATE', changed,
         to_jsonb(old), to_jsonb(new), who);

    elsif tg_op = 'INSERT' then
      insert into public.audit_log
        (table_name, row_id, action, old_data, new_data, actor)
      values
        (tg_table_name, (to_jsonb(new) ->> 'id')::uuid, 'INSERT', null, to_jsonb(new), who);

    else
      insert into public.audit_log
        (table_name, row_id, action, old_data, new_data, actor)
      values
        (tg_table_name, (to_jsonb(old) ->> 'id')::uuid, 'DELETE', to_jsonb(old), null, who);
    end if;
  exception when others then
    null;
  end;

  return null;
end;
$$;

drop trigger if exists audit_guests   on public.guests;
drop trigger if exists audit_rooms    on public.rooms;
drop trigger if exists audit_bookings on public.bookings;

create trigger audit_guests   after insert or update or delete on public.guests
  for each row execute function public.audit_row();
create trigger audit_rooms    after insert or update or delete on public.rooms
  for each row execute function public.audit_row();
create trigger audit_bookings after insert or update or delete on public.bookings
  for each row execute function public.audit_row();

alter table public.audit_log enable row level security;
drop policy if exists "authenticated full access" on public.audit_log;
create policy "authenticated full access" on public.audit_log
  for all to authenticated using (true) with check (true);
