// Merge scripts/update_1.csv into the `guests` table.
//
// Rules:
//   - Skip rows with order_code = 'CORE-TRIBE' (staff already correct in DB).
//   - Match existing guests by (order_code, lower(full_name)).
//   - For new pairs: INSERT all fields from the csv.
//   - For existing pairs: UPDATE only the fields that differ from the csv,
//     and only overwrite `tribe` if the csv value is non-empty (so tribes
//     already set in the DB are preserved when the csv leaves the cell blank).
//   - Never touches RAVEPASS / RAVEPASS EXTENSION guests (they aren't in the csv).
//   - Never touches `bookings`.
//
// Excel serial dates (e.g. 46275) are converted to YYYY-MM-DD.
//
// Run:
//   node --env-file=.env.local scripts/_upsert_room_guests.mjs            # dry-run
//   node --env-file=.env.local scripts/_upsert_room_guests.mjs --apply    # write

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apply = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function excelSerialToISO(serial) {
  if (serial == null || serial === '') return null
  const n = Number(serial)
  if (!Number.isFinite(n)) return null
  // If it already looks like an ISO date, pass through.
  if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}/.test(serial)) return serial.slice(0, 10)
  const epoch = Date.UTC(1899, 11, 30)
  const ms = epoch + n * 86400000
  const d = new Date(ms)
  return d.toISOString().slice(0, 10)
}

function normalizeTicket(raw) {
  if (!raw) return raw
  const t = raw.toUpperCase()
  if (t.includes('RAVEPASS EXTENSION')) return 'RAVEPASS EXTENSION'
  if (t.includes('RAVEPASS') && !t.includes('ROOM')) return 'RAVEPASS'
  const nights = t.includes('4 NIGHTS') ? '4 NIGHTS' : t.includes('3 NIGHTS') ? '3 NIGHTS' : null
  const upgraded = t.includes('UPGRADED')
  const kind = t.includes('SINGLE') ? 'SINGLE ROOM'
    : t.includes('TRIPLE') ? 'TRIPLE ROOM'
    : t.includes('QUADRUPLE') ? 'QUADRUPLE ROOM'
    : t.includes('DOUBLE') ? 'DOUBLE ROOM'
    : null
  if (!kind || !nights) return raw.trim()
  return `${upgraded ? 'UPGRADED ' : ''}${kind} ${nights}`
}

function normalizeRole(raw) {
  const r = (raw || '').trim().toLowerCase()
  if (r === 'both') return 'Both'
  if (r.startsWith('lead')) return 'Leader'
  return 'Follower'
}

function readCsv(path) {
  const text = readFileSync(path, 'utf-8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  const header = lines[0].split(';')
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';')
    const row = {}
    for (let j = 0; j < header.length; j++) row[header[j]] = (cols[j] ?? '').trim()
    rows.push(row)
  }
  return rows
}

const raw = readCsv(join(__dirname, 'update_1.csv'))

const records = raw
  .filter((r) => r.order_code && r.order_code !== 'CORE-TRIBE')
  .map((r) => ({
    order_code: r.order_code,
    full_name: r.full_name.trim(),
    role: normalizeRole(r.role),
    country: r.country || null,
    ticket_type: normalizeTicket(r.ticket_type),
    hotel: r.hotel || null,
    tribe: r.tribe || null,
    check_in_date: excelSerialToISO(r.check_in_date),
    check_out_date: excelSerialToISO(r.check_out_date),
  }))

console.log(`csv records to process: ${records.length} (CORE-TRIBE skipped)`)

const orderCodes = [...new Set(records.map((r) => r.order_code))]
const existing = []
const chunk = 200
for (let i = 0; i < orderCodes.length; i += chunk) {
  const slice = orderCodes.slice(i, i + chunk)
  const { data, error } = await supabase
    .from('guests')
    .select('id, order_code, full_name, role, country, ticket_type, hotel, tribe, check_in_date, check_out_date')
    .in('order_code', slice)
  if (error) { console.error('Fetch failed:', error); process.exit(1) }
  existing.push(...(data ?? []))
}
console.log(`db rows fetched for those order_codes: ${existing.length}`)

const dbIndex = new Map()
for (const g of existing) {
  const key = `${g.order_code}::${g.full_name.toLowerCase()}`
  dbIndex.set(key, g)
}

const toInsert = []
const toUpdate = []  // { id, diffs }
const unchanged = []

function fieldDiff(dbVal, csvVal, allowNull = false) {
  const a = dbVal ?? null
  const b = csvVal ?? null
  if (!allowNull && b === null) return false  // csv blank -> don't update
  return a !== b
}

for (const r of records) {
  const key = `${r.order_code}::${r.full_name.toLowerCase()}`
  const dbRow = dbIndex.get(key)
  if (!dbRow) { toInsert.push(r); continue }
  const diffs = {}
  // For these fields: update if csv has a non-empty value AND it differs.
  for (const f of ['role', 'country', 'ticket_type', 'hotel', 'check_in_date', 'check_out_date']) {
    if (fieldDiff(dbRow[f], r[f])) diffs[f] = r[f]
  }
  // Tribe: only set if csv brings a non-empty value (preserves manual assignments).
  if (r.tribe && r.tribe !== dbRow.tribe) diffs.tribe = r.tribe
  if (Object.keys(diffs).length > 0) toUpdate.push({ id: dbRow.id, order_code: dbRow.order_code, full_name: dbRow.full_name, diffs })
  else unchanged.push(dbRow)
}

console.log('')
console.log(`Plan:`)
console.log(`  inserts:   ${toInsert.length}`)
console.log(`  updates:   ${toUpdate.length}`)
console.log(`  unchanged: ${unchanged.length}`)

if (toInsert.length > 0) {
  console.log('\nFirst 10 inserts:')
  for (const r of toInsert.slice(0, 10)) {
    console.log(`  + [${r.order_code}] ${r.full_name} · ${r.ticket_type} · ${r.hotel ?? '-'} · ${r.check_in_date}->${r.check_out_date}`)
  }
  if (toInsert.length > 10) console.log(`  ... and ${toInsert.length - 10} more`)
}

if (toUpdate.length > 0) {
  console.log('\nFirst 10 updates:')
  for (const u of toUpdate.slice(0, 10)) {
    console.log(`  ~ [${u.order_code}] ${u.full_name}: ${JSON.stringify(u.diffs)}`)
  }
  if (toUpdate.length > 10) console.log(`  ... and ${toUpdate.length - 10} more`)
}

if (!apply) {
  console.log('\nDry-run. Re-run with --apply to commit changes.')
  process.exit(0)
}

if (toInsert.length > 0) {
  const { error } = await supabase.from('guests').insert(toInsert)
  if (error) { console.error('Insert failed:', error); process.exit(1) }
  console.log(`\nInserted ${toInsert.length}.`)
}
for (const u of toUpdate) {
  const { error } = await supabase.from('guests').update(u.diffs).eq('id', u.id)
  if (error) { console.error(`Update failed for ${u.id}:`, error); process.exit(1) }
}
console.log(`Updated ${toUpdate.length}.`)
console.log('Done.')
