// Import all 398 attendees from scripts/attendees.csv into the `guests` table.
// Rules:
//   - Rows with "&" in Full name split into 2 guests sharing the same order_code.
//   - Annotations like "(Special Triple Room)" or "-SPECIAL UPGRADED TRIPLE ROOM" are stripped from the name
//     but the original raw ticket text is kept for reference in ticket_type normalization below.
//   - Ticket type is normalized to short canonical form (RAVEPASS / DOUBLE ROOM 3 NIGHTS / ...).
//   - Hotel: H4 if ticket contains "UPGRADED", H3 for other rooms, null for RAVEPASS.
//   - Dates: 4 nights = Sep 10–15 2026, 3 nights = Sep 12–15 2026, RAVEPASS = null.
//
// Run: node --env-file=.env.local scripts/import_guests.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
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
  if (ticket.includes('4 NIGHTS')) return { check_in: '2026-09-10', check_out: '2026-09-15' }
  if (ticket.includes('3 NIGHTS')) return { check_in: '2026-09-12', check_out: '2026-09-15' }
  return { check_in: null, check_out: null }
}

function normalizeRole(raw) {
  const r = raw.trim().toLowerCase()
  if (r === 'both') return 'Both'
  if (r.startsWith('lead')) return 'Leader'
  return 'Follower'
}

const csv = readFileSync(join(__dirname, 'attendees.csv'), 'utf-8').replace(/^\uFEFF/, '')
const lines = csv.split(/\r?\n/).slice(1).filter(Boolean)

const records = []
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

  const names = rawName.includes('&')
    ? rawName.split('&').map(cleanName)
    : [cleanName(rawName)]

  for (const full_name of names) {
    if (!full_name || full_name.length < 2) continue
    const key = `${order}::${full_name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({
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

console.log(`Parsed ${records.length} guest records from CSV`)

console.log('Wiping existing bookings and guests...')
await supabase.from('bookings').delete().gte('created_at', '1970-01-01')
const { error: wipeErr } = await supabase.from('guests').delete().gte('created_at', '1970-01-01')
if (wipeErr) { console.error('Wipe failed:', wipeErr); process.exit(1) }

console.log(`Inserting ${records.length} guests in batches of 100...`)
for (let i = 0; i < records.length; i += 100) {
  const batch = records.slice(i, i + 100)
  const { error } = await supabase.from('guests').insert(batch)
  if (error) {
    console.error(`Batch ${i} failed:`, error.message)
    process.exit(1)
  }
  console.log(`  ...inserted ${Math.min(i + 100, records.length)}`)
}

const { count } = await supabase.from('guests').select('*', { count: 'exact', head: true })
console.log(`Done. guests table now has ${count} rows.`)
