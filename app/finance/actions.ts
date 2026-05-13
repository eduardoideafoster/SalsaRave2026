'use server'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

interface RawAttendeeRow {
  Locator?: number | string
  Order?: string
  Date?: string
  Status?: string
  Ticket?: string
  'Sale Type'?: string
  Price?: number | string
  'Full name'?: string
  Email?: string
  Phone?: string
  Role?: string
  Country?: string
}

interface ParsedPayment {
  locator: number
  order_code: string
  sale_date: string | null
  status: string | null
  ticket: string
  sale_type: string | null
  price_eur: number
  full_name: string | null
  email: string | null
  phone: string | null
  role: string | null
  country: string | null
}

export async function importPaymentsXlsx(formData: FormData): Promise<
  | { ok: true; inserted: number; updated: number; totalPrice: number }
  | { ok: false; error: string }
> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No file provided' }

  let rows: RawAttendeeRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<RawAttendeeRow>(sheet, { defval: null })
  } catch (err) {
    return { ok: false, error: `Could not parse XLSX: ${(err as Error).message}` }
  }

  const parsed: ParsedPayment[] = []
  for (const r of rows) {
    const locator = Number(r.Locator)
    if (!Number.isFinite(locator) || locator <= 0) continue
    if (!r.Order || !r.Ticket) continue
    parsed.push({
      locator,
      order_code: String(r.Order).trim(),
      sale_date: r.Date ? new Date(String(r.Date)).toISOString() : null,
      status: r.Status ?? null,
      ticket: String(r.Ticket).trim(),
      sale_type: r['Sale Type'] ?? null,
      price_eur: Number(r.Price) || 0,
      full_name: r['Full name'] ?? null,
      email: r.Email ?? null,
      phone: r.Phone ?? null,
      role: r.Role ?? null,
      country: r.Country ?? null,
    })
  }

  if (parsed.length === 0) return { ok: false, error: 'No valid rows found' }

  const supabase = await createClient()

  const { data: existing, error: existingErr } = await supabase
    .from('payments')
    .select('locator')
  if (existingErr) return { ok: false, error: existingErr.message }
  const existingLocators = new Set(existing?.map((p) => Number(p.locator)) ?? [])

  const { error: upsertErr } = await supabase
    .from('payments')
    .upsert(parsed, { onConflict: 'locator' })
  if (upsertErr) return { ok: false, error: upsertErr.message }

  let inserted = 0
  let updated = 0
  for (const p of parsed) {
    if (existingLocators.has(p.locator)) updated++
    else inserted++
  }
  const totalPrice = parsed.reduce((a, p) => a + p.price_eur, 0)
  return { ok: true, inserted, updated, totalPrice }
}
