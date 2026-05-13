-- Payments table for the /finance dashboard.
-- One row per attendee (matches the Eventbrite/goandance Attendees export).
-- The first attendee of an order has the full price; the rest are 0.
-- Sum(price_eur) across the table = total gross revenue (incl. platform fees).

CREATE TABLE IF NOT EXISTS payments (
  locator bigint PRIMARY KEY,
  order_code text NOT NULL,
  sale_date timestamptz,
  status text,
  ticket text NOT NULL,
  sale_type text,
  price_eur numeric(12,2) NOT NULL DEFAULT 0,
  full_name text,
  email text,
  phone text,
  role text,
  country text,
  imported_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_code ON payments(order_code);
CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open access" ON payments;
CREATE POLICY "open access" ON payments FOR ALL USING (true) WITH CHECK (true);
