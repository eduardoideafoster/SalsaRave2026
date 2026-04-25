// Compare canonical CSV vs current `guests` table and restore any rows that
// are missing. Matches by (order_code, full_name) using the same normalization
// as scripts/import_guests.mjs. By default just prints a diff; pass --apply to
// actually re-insert the missing rows.
//
// Run:
//   node --env-file=.env.local scripts/_restore_deleted_guests.mjs            # dry-run
//   node --env-file=.env.local scripts/_restore_deleted_guests.mjs --apply    # restore

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

function cleanName(raw) {
  return raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*[-–]\s*SPECIAL[^&]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTicket(raw) {
  const t = raw.toUpperCase()
  if (t.includes('RAVEPASS EXTENSION')) return 'RAVEPASS EXTENSION'
  if (t.includes('RAVEPASS') && !t.includes('ROOM')) return 'RAVEPASS'
  const nights = t.includes('4 NIGHTS') ? '4 NIGHTS' : t.includes('3 NIGHTS') ? '3 NIGHTS' : null
  const upgraded = t.includes('UPGRADED')
  const kind = t.includes('SINGLE') ? 'SINGLE ROOM' : t.includes('DOUBLE') ? 'DOUBLE ROOM' : null
  if (!kind || !nights) return raw
  return `${upgraded ? 'UPGRADED ' : ''}${kind} ${nights}`
}

function hotelFor(ticket) {
  if (ticket.startsWith('RAVEPASS')) return null
  if (ticket.includes('UPGRADED')) return 'H4'
  return 'H3'
}

function datesFor(ticket) {
  if (ticket.startsWith('RAVEPASS')) return { check_in: null, check_out: null }
  if (ticket.includes('4 NIGHTS')) return { check_in: '2026-09-10', check_out: '2026-09-14' }
  if (ticket.includes('3 NIGHTS')) return { check_in: '2026-09-11', check_out: '2026-09-14' }
  return { check_in: null, check_out: null }
}

function normalizeRole(raw) {
  const r = raw.trim().toLowerCase()
  if (r === 'both') return 'Both'
  if (r.startsWith('lead')) return 'Leader'
  return 'Follower'
}

const csv = readFileSync(join(__dirname, 'attendees.csv'), 'utf-8').replace(/^﻿/, '')
const lines = csv.split(/\r?\n/).slice(1).filter(Boolean)

const canonical = []
const seen = new Set()
for (const line of lines) {
  const parts = line.split(';')
  if (parts.length < 8) continue
  const [order, , , , rawTicket, rawName, rawRole, rawCountry] = parts
  const ticket = normalizeTicket(rawTicket)
  const hotel = hotelFor(ticket)
  const { check_in, check_out } = datesFor(ticket)
  const role = normalizeRole(rawRole)
  const country = (rawCountry || '').trim() || null
  const names = rawName.includes('&') ? rawName.split('&').map(cleanName) : [cleanName(rawName)]
  for (const full_name of names) {
    if (!full_name || full_name.length < 2) continue
    const key = `${order.trim()}::${full_name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    canonical.push({
      _key: key,
      order_code: order.trim(),
      full_name,
      role,
      country,
      ticket_type: ticket,
      hotel,
      check_in_date: check_in,
      check_out_date: check_out,
    })
  }
}

console.log(`CSV canonical rows: ${canonical.length}`)

const live = []
const pageSize = 1000
for (let from = 0; ; from += pageSize) {
  const { data, error } = await supabase
    .from('guests')
    .select('id, order_code, full_name')
    .range(from, from + pageSize - 1)
  if (error) { console.error('Fetch failed:', error); process.exit(1) }
  if (!data || data.length === 0) break
  live.push(...data)
  if (data.length < pageSize) break
}
console.log(`DB guests rows:     ${live.length}`)

const liveKeys = new Set(live.map((g) => `${g.order_code}::${g.full_name.toLowerCase()}`))
const missing = canonical.filter((c) => !liveKeys.has(c._key))

console.log(`\nMissing from DB (${missing.length}):`)
for (const m of missing) {
  console.log(`  - [${m.order_code}] ${m.full_name}  ·  ${m.ticket_type}  ·  ${m.hotel ?? 'no-hotel'}  ·  ${m.role}/${m.country ?? '?'}`)
}

if (!apply) {
  console.log('\nDry-run. Re-run with --apply to insert these rows back into guests.')
  process.exit(0)
}

if (missing.length === 0) {
  console.log('Nothing to restore.')
  process.exit(0)
}

const toInsert = missing.map(({ _key, ...rest }) => rest)
const { error } = await supabase.from('guests').insert(toInsert)
if (error) { console.error('Insert failed:', error); process.exit(1) }
console.log(`Restored ${toInsert.length} guest(s).`)
