'use server'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

function parseSaleDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const d = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

// Slim XLS exports (Promoter Sales tab) have no Locator. Build a deterministic
// negative locator from the order_code so it never collides with real
// Eventbrite locators (which are positive 11-digit ints).
function syntheticLocator(orderCode: string): number {
  let v = 0
  for (const ch of orderCode.toUpperCase()) {
    const c = ch.charCodeAt(0)
    let digit: number
    if (c >= 48 && c <= 57) digit = c - 48           // 0-9
    else if (c >= 65 && c <= 90) digit = c - 65 + 10 // A-Z
    else digit = 35                                   // unknown → max
    v = v * 36 + digit
  }
  return -v
}

const RAVEPASS_PRICE_EUR = 135

interface RawRow {
  Locator?: number | string
  Order?: string
  Date?: string
  Status?: string
  Ticket?: string
  'Ticket Type'?: string
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
  | { ok: true; mode: 'full' | 'slim'; inserted: number; updated: number; skipped: number; totalPrice: number }
  | { ok: false; error: string }
> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No file provided' }

  let rows: RawRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null })
  } catch (err) {
    return { ok: false, error: `Could not parse XLSX: ${(err as Error).message}` }
  }

  if (rows.length === 0) return { ok: false, error: 'No rows found' }

  const sample = rows[0] ?? {}
  const isSlim =
    sample.Locator == null &&
    (sample['Ticket Type'] != null || sample.Ticket == null)

  return isSlim ? importSlim(rows) : importFull(rows)
}

async function importFull(rows: RawRow[]) {
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
  if (parsed.length === 0) return { ok: false as const, error: 'No valid rows found' }

  const supabase = await createClient()

  const { data: existing, error: existingErr } = await supabase
    .from('payments')
    .select('locator, attendee_index')
  if (existingErr) return { ok: false as const, error: existingErr.message }
  const existingKeys = new Set(
    (existing ?? []).map((p) => `${p.locator}:${p.attendee_index}`),
  )

  const { error: upsertErr } = await supabase
    .from('payments')
    .upsert(parsed, { onConflict: 'locator,attendee_index' })
  if (upsertErr) return { ok: false as const, error: upsertErr.message }

  let inserted = 0
  let updated = 0
  for (const p of parsed) {
    if (existingKeys.has(`${p.locator}:${p.attendee_index}`)) updated++
    else inserted++
  }
  const totalPrice = parsed.reduce((a, p) => a + p.price_eur, 0)
  return { ok: true as const, mode: 'full' as const, inserted, updated, skipped: 0, totalPrice }
}

// Slim format: Order, Ticket Type, Full name, Role, Country.
// Insert-only by order_code: skip any order that already exists in DB.
// Price defaults to 135 €/row (RavePass).
async function importSlim(rows: RawRow[]) {
  const parsed: ParsedPayment[] = []
  const indexByOrder = new Map<string, number>()
  for (const r of rows) {
    if (!r.Order) continue
    const order = String(r.Order).trim()
    if (!order) continue
    const ticket = (r['Ticket Type'] ?? r.Ticket ?? 'RAVEPASS').toString().trim()
    const attendee_index = (indexByOrder.get(order) ?? 0) + 1
    indexByOrder.set(order, attendee_index)
    parsed.push({
      locator: syntheticLocator(order),
      attendee_index,
      order_code: order,
      sale_date: null,
      status: null,
      ticket,
      sale_type: 'manual',
      price_eur: RAVEPASS_PRICE_EUR,
      full_name: r['Full name'] ?? null,
      email: null,
      phone: null,
      role: r.Role ?? null,
      country: r.Country ?? null,
    })
  }
  if (parsed.length === 0) return { ok: false as const, error: 'No valid rows in slim XLS' }

  const supabase = await createClient()

  const { data: existing, error: existingErr } = await supabase
    .from('payments')
    .select('order_code')
  if (existingErr) return { ok: false as const, error: existingErr.message }
  const existingOrders = new Set((existing ?? []).map((p) => String(p.order_code)))

  const toInsert = parsed.filter((p) => !existingOrders.has(p.order_code))
  const skipped = parsed.length - toInsert.length

  if (toInsert.length === 0) {
    return { ok: true as const, mode: 'slim' as const, inserted: 0, updated: 0, skipped, totalPrice: 0 }
  }

  const { error: insertErr } = await supabase.from('payments').insert(toInsert)
  if (insertErr) return { ok: false as const, error: insertErr.message }

  const totalPrice = toInsert.reduce((a, p) => a + p.price_eur, 0)
  return {
    ok: true as const,
    mode: 'slim' as const,
    inserted: toInsert.length,
    updated: 0,
    skipped,
    totalPrice,
  }
}
