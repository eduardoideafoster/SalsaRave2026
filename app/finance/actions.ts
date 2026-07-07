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

// Accepts messy header spellings from every SalsaRave export we've seen so
// far — Eventbrite XLS ('Locator', 'Full name', 'Ticket'), goandance slim XLS
// ('Ticket Type'), promoter CSV ('order_code', 'full_name', 'ticket_type').
// Normalizes to canonical RawRow keys.
function canonicalRow(raw: Record<string, unknown>): RawRow {
  const out: RawRow = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toString().toLowerCase().replace(/[_\s]+/g, '')
    switch (key) {
      case 'order':
      case 'ordercode':
        out.Order = v as string; break
      case 'locator':
        out.Locator = v as number | string; break
      case 'date':
      case 'saledate':
        out.Date = v as string; break
      case 'status':
        out.Status = v as string; break
      case 'ticket':
      case 'tickettype':
        out.Ticket = v as string
        out['Ticket Type'] = v as string
        break
      case 'saletype':
        out['Sale Type'] = v as string; break
      case 'price':
        out.Price = v as number | string; break
      case 'fullname':
      case 'name':
        out['Full name'] = v as string; break
      case 'email':
        out.Email = v as string; break
      case 'phone':
        out.Phone = v as string; break
      case 'role':
        out.Role = v as string; break
      case 'country':
        out.Country = v as string; break
    }
  }
  return out
}

function readSheetRows(buf: Buffer, filename: string): Record<string, unknown>[] {
  const isCsv = /\.csv$/i.test(filename)
  if (isCsv) {
    // Sniff delimiter from the first line (semicolon or comma).
    const head = buf.slice(0, 4096).toString('utf8').split(/\r?\n/)[0] ?? ''
    const FS = head.split(';').length > head.split(',').length ? ';' : ','
    const wb = XLSX.read(buf, { type: 'buffer', FS, raw: true })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  }
  const wb = XLSX.read(buf, { type: 'buffer' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
}

export async function importPaymentsXlsx(formData: FormData): Promise<
  | { ok: true; mode: 'full' | 'slim'; inserted: number; updated: number; skipped: number; dedupedInFile: number; totalPrice: number }
  | { ok: false; error: string }
> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No file provided' }

  let rows: RawRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const raw = readSheetRows(buf, file.name)
    rows = raw.map((r) => canonicalRow(r as Record<string, unknown>))
  } catch (err) {
    return { ok: false, error: `Could not parse file: ${(err as Error).message}` }
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
  return { ok: true as const, mode: 'full' as const, inserted, updated, skipped: 0, dedupedInFile: 0, totalPrice }
}

function normalizeName(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Slim format: Order, [Date, Ticket Type], Full name, Role, Country.
// Rules:
// - Dedupe within-file by normalized full_name (keep first occurrence).
//   Duplicates are treated as RavePass extensions — they don't count as
//   a new paid attendee.
// - Insert-only by order_code: any order already in DB is skipped whole.
// - Default price 135 €/row (RavePass).
async function importSlim(rows: RawRow[]) {
  const parsed: ParsedPayment[] = []
  const seenNames = new Set<string>()
  const indexByOrder = new Map<string, number>()
  let dedupedInFile = 0

  for (const r of rows) {
    if (!r.Order) continue
    const order = String(r.Order).trim()
    if (!order) continue

    const nameKey = normalizeName(r['Full name'])
    if (nameKey && seenNames.has(nameKey)) {
      dedupedInFile++
      continue
    }
    if (nameKey) seenNames.add(nameKey)

    const ticket = (r['Ticket Type'] ?? r.Ticket ?? 'RAVEPASS').toString().trim()
    const attendee_index = (indexByOrder.get(order) ?? 0) + 1
    indexByOrder.set(order, attendee_index)
    parsed.push({
      locator: syntheticLocator(order),
      attendee_index,
      order_code: order,
      sale_date: parseSaleDate(r.Date),
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
    .select('order_code, full_name')
  if (existingErr) return { ok: false as const, error: existingErr.message }
  const existingOrders = new Set((existing ?? []).map((p) => String(p.order_code)))
  const existingNames = new Set(
    (existing ?? [])
      .map((p) => normalizeName(p.full_name as string | null))
      .filter(Boolean),
  )

  const toInsert: ParsedPayment[] = []
  let skipped = 0
  for (const p of parsed) {
    const nameKey = normalizeName(p.full_name)
    if (existingOrders.has(p.order_code) || (nameKey && existingNames.has(nameKey))) {
      skipped++
      continue
    }
    toInsert.push(p)
  }

  if (toInsert.length === 0) {
    return { ok: true as const, mode: 'slim' as const, inserted: 0, updated: 0, skipped, dedupedInFile, totalPrice: 0 }
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
    dedupedInFile,
    totalPrice,
  }
}
