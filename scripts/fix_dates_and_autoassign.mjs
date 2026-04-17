// One-shot migration:
//   1. Fix all guest check-in/check-out dates to the real schedule:
//        4 NIGHTS -> Sep 10 (Thu) to Sep 14 (Mon)
//        3 NIGHTS -> Sep 11 (Fri) to Sep 14 (Mon)
//      RAVEPASS guests keep null dates (no accommodation).
//   2. Wipe the bookings table.
//   3. Auto-assign all guests to rooms:
//        - group by order_code (same order = share a room)
//        - prefer exact capacity match: group of 3 -> triple, 1-2 -> double
//        - only guest rooms (is_staff = false) are used
//        - groups that don't fit any empty matching room are skipped and
//          listed at the end for manual review
//
// Run: node --env-file=.env.local scripts/fix_dates_and_autoassign.mjs

import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// 1) Fix dates
console.log('1) Updating guest check-in/check-out dates...')
const fourNight = await sql`
  UPDATE guests
  SET check_in_date = '2026-09-10', check_out_date = '2026-09-14'
  WHERE ticket_type LIKE '%4 NIGHTS%'
  RETURNING id
`
const threeNight = await sql`
  UPDATE guests
  SET check_in_date = '2026-09-11', check_out_date = '2026-09-14'
  WHERE ticket_type LIKE '%3 NIGHTS%'
  RETURNING id
`
console.log(`   4-night guests updated: ${fourNight.length}`)
console.log(`   3-night guests updated: ${threeNight.length}`)

// 2) Wipe bookings
console.log('2) Wiping existing bookings...')
await sql`DELETE FROM bookings`

// 3) Auto-assign
console.log('3) Fetching updated state...')
const { data: guests } = await supabase.from('guests').select('*')
const { data: rooms } = await supabase.from('rooms').select('*')

const guestRooms = (rooms ?? []).filter((r) => !r.is_staff)
const roomsByHotel = {
  H3: guestRooms.filter((r) => r.hotel === 'H3'),
  H4: guestRooms.filter((r) => r.hotel === 'H4'),
}
// Sort rooms by capacity ASC so group-of-1 uses a double before stealing a triple
for (const h of ['H3', 'H4']) {
  roomsByHotel[h].sort((a, b) => a.capacity - b.capacity || Number(a.room_number) - Number(b.room_number))
}

// Group unassigned guests (those with hotel + dates) by order_code
const groups = new Map()
for (const g of guests ?? []) {
  if (!g.hotel || !g.check_in_date || !g.check_out_date) continue
  const arr = groups.get(g.order_code) ?? []
  arr.push(g)
  groups.set(g.order_code, arr)
}

// Largest groups first so triples go to triples
const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

const filled = new Set()
const bookingsToInsert = []
const skipped = []

for (const [order, members] of entries) {
  const hotel = members[0].hotel
  const size = members.length

  // Candidates: same hotel, capacity >= size, not yet filled, and within this
  // batch no existing occupants. Prefer smallest capacity that still fits.
  const candidate = roomsByHotel[hotel].find(
    (r) => !filled.has(r.id) && r.capacity >= size,
  )
  if (!candidate) {
    skipped.push({ order, size, hotel, names: members.map((m) => m.full_name) })
    continue
  }
  filled.add(candidate.id)
  for (const g of members) {
    bookingsToInsert.push({
      guest_id: g.id,
      room_id: candidate.id,
      check_in_date: g.check_in_date,
      check_out_date: g.check_out_date,
      status: 'confirmed',
    })
  }
}

console.log(`   Ready to insert ${bookingsToInsert.length} bookings across ${filled.size} rooms`)

// Insert in batches
for (let i = 0; i < bookingsToInsert.length; i += 100) {
  const batch = bookingsToInsert.slice(i, i + 100)
  const { error } = await supabase.from('bookings').insert(batch)
  if (error) {
    console.error(`Batch ${i} failed:`, error.message)
    process.exit(1)
  }
}

console.log(`\n=== Summary ===`)
console.log(`Guests auto-assigned: ${bookingsToInsert.length}`)
console.log(`Rooms used:           ${filled.size}`)
console.log(`Guest rooms total:    ${guestRooms.length}`)
console.log(`Rooms remaining:      ${guestRooms.length - filled.size}`)
console.log(`Skipped groups:       ${skipped.length}`)
if (skipped.length > 0) {
  console.log('\nSkipped (no room big enough — manual review needed):')
  for (const s of skipped) {
    console.log(`  order ${s.order} · ${s.hotel} · ${s.size} people: ${s.names.join(', ')}`)
  }
}

await sql.end()
