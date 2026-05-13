'use server'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

function parseSaleDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const d = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

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
  attendee_index: number
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
  const indexByLocator = new Map<number, number>()
  for (const r of rows) {
    const locator = Number(r.Locator)
    if (!Number.isFinite(locator) || locator <= 0) continue
    if (!r.Order || !r.Ticket) continue
    const attendee_index = (indexByLocator.get(locator) ?? 0) + 1
    indexByLocator.set(locator, attendee_index)
    parsed.push({
      locator,
      attendee_index,
      order_code: String(r.Order).trim(),
      sale_date: parseSaleDate(r.Date),
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
    .select('locator, attendee_index')
  if (existingErr) return { ok: false, error: existingErr.message }
  const existingKeys = new Set(
    (existing ?? []).map((p) => `${p.locator}:${p.attendee_index}`),
  )

  const { error: upsertErr } = await supabase
    .from('payments')
    .upsert(parsed, { onConflict: 'locator,attendee_index' })
  if (upsertErr) return { ok: false, error: upsertErr.message }

  let inserted = 0
  let updated = 0
  for (const p of parsed) {
    if (existingKeys.has(`${p.locator}:${p.attendee_index}`)) updated++
    else inserted++
  }
  const totalPrice = parsed.reduce((a, p) => a + p.price_eur, 0)
  return { ok: true, inserted, updated, totalPrice }
}
