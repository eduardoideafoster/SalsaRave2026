-- /finance and /interno read the same finance_entries table. Most entries are
-- the same in both -- the DJs cost what they cost -- but some differ: the
-- payment made to the hotel is 91.000 in one and 24.495 in the other.
--
-- scope says who an entry belongs to. 'both' is the default, so nothing that
-- existed before this column changes hands.

alter table finance_entries
  add column if not exists scope text not null default 'both'
  check (scope in ('both', 'finance', 'interno'));

comment on column finance_entries.scope is
  'Which page shows this entry: both (default), or only /finance or only /interno. The two pages read the same table, so an entry that differs between them has to say so.';
