-- Finance entries table for the /finance dashboard.
-- One row per income or expense, manually entered.

CREATE TABLE IF NOT EXISTS finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income','expense')),
  category text NOT NULL,
  description text,
  amount_eur numeric(12,2) NOT NULL,
  date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

-- App-level password gate already guards access. Open RLS so the existing
-- anon key can read/write within the /finance page. If we ever expose a
-- different surface, we'd tighten this with a JWT claim or service-role-only.
DROP POLICY IF EXISTS "open access" ON finance_entries;
CREATE POLICY "open access" ON finance_entries FOR ALL USING (true) WITH CHECK (true);
