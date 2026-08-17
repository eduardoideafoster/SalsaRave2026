-- /finance and /interno share exactly one figure: what came in from ticket
-- sales, which is read from `payments` and is the same in both. Everything
-- built on top of that -- every expense, every extra income -- is each page's
-- own. The hotel payment is 91.000 in one and 24.495 in the other, and the two
-- are meant to keep diverging.
--
-- So an entry belongs to one page. There is deliberately no 'shared' value:
-- one row showing in both places is what made editing an amount in one page
-- silently edit it in the other.

alter table finance_entries
  add column if not exists scope text not null default 'both';

-- Every entry that predates this column existed once and showed in both pages.
-- Duplicating them gives each page the same starting point rather than leaving
-- /interno blank for Eduardo to retype.
insert into finance_entries (type, category, description, amount_eur, date, scope)
select type, category, description, amount_eur, date, 'interno'
from finance_entries where scope = 'both';

update finance_entries set scope = 'finance' where scope = 'both';

alter table finance_entries drop constraint if exists finance_entries_scope_check;
alter table finance_entries alter column scope drop default;
alter table finance_entries
  add constraint finance_entries_scope_check check (scope in ('finance', 'interno'));

comment on column finance_entries.scope is
  'Which page owns this entry: /finance or /interno. Never both — the pages share only the ticket sales figure.';
