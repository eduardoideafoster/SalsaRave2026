// Add 'single' to the rooms.room_type CHECK constraint so doubles that
// are occupied by a solo SINGLE-ticket guest can be tagged as single.
// Then re-run auto-assign, tagging solo+SINGLE rooms as single w/ capacity 1.
//
// Run: node --env-file=.env.local scripts/add_single_room_type.mjs

import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

console.log('1) Loosening room_type CHECK constraint to include "single"...')
// Find current constraint name (Supabase auto-generates one like rooms_room_type_check)
const constraints = await sql`
  SELECT conname FROM pg_constraint
  WHERE conrelid = 'rooms'::regclass AND contype = 'c'
`
for (const c of constraints) {
  if (c.conname.includes('room_type')) {
    await sql`ALTER TABLE rooms DROP CONSTRAINT ${sql(c.conname)}`
    console.log(`   dropped ${c.conname}`)
  }
}
await sql`
  ALTER TABLE rooms ADD CONSTRAINT rooms_room_type_check
  CHECK (room_type IN ('single','double','triple_3beds','triple_double_single','quadruple'))
`
await sql`NOTIFY pgrst, 'reload schema'`

console.log('2) Re-running auto-assign from scratch, with solo-single tagging...')
await sql`DELETE FROM bookings`
// Reset any previously-singlified rooms back to double cap 2 so we start clean
await sql`UPDATE rooms SET room_type = 'double', capacity = 2
          WHERE room_type = 'single'`

const { data: guests } = await supabase.from('guests').select('*')
const { data: rooms } = await supabase.from('rooms').select('*')

const guestRooms = (rooms ?? []).filter((r) => !r.is_staff)
const roomsByHotel = {
  H3: guestRooms.filter((r) => r.hotel === 'H3').sort((a, b) => a.capacity - b.capacity || Number(a.room_number) - Number(b.room_number)),
  H4: guestRooms.filter((r) => r.hotel === 'H4').sort((a, b) => a.capacity - b.capacity || Number(a.room_number) - Number(b.room_number)),
}

// Group by order_code
const groups = new Map()
for (const g of guests ?? []) {
  if (!g.hotel || !g.check_in_date || !g.check_out_date) continue
  const arr = groups.get(g.order_code) ?? []
  arr.push(g)
  groups.set(g.order_code, arr)
}

const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
const filled = new Set()
const bookingsToInsert = []
const singleRoomUpdates = []
const skipped = []

for (const [order, members] of entries) {
  const hotel = members[0].hotel
  const size = members.length
  const room = roomsByHotel[hotel].find(
    (r) => !filled.has(r.id) && r.capacity >= size,
  )
  if (!room) {
    skipped.push({ order, size, hotel, names: members.map((m) => m.full_name) })
    continue
  }
  filled.add(room.id)

  // Solo SINGLE-ticket guest? Mark the room as single (capacity 1).
  const isSingleOccupancy =
    size === 1 &&
    members[0].ticket_type &&
    members[0].ticket_type.toUpperCase().includes('SINGLE ROOM') &&
    room.room_type === 'double'
  if (isSingleOccupancy) {
    singleRoomUpdates.push(room.id)
  }

  for (const g of members) {
    bookingsToInsert.push({
      guest_id: g.id,
      room_id: room.id,
      check_in_date: g.check_in_date,
      check_out_date: g.check_out_date,
      status: 'confirmed',
    })
  }
}

console.log(`3) Inserting ${bookingsToInsert.length} bookings...`)
for (let i = 0; i < bookingsToInsert.length; i += 100) {
  const batch = bookingsToInsert.slice(i, i + 100)
  const { error } = await supabase.from('bookings').insert(batch)
  if (error) { console.error(`Batch ${i} failed:`, error.message); process.exit(1) }
}

if (singleRoomUpdates.length > 0) {
  console.log(`4) Marking ${singleRoomUpdates.length} doubles as single (solo SINGLE-ticket)...`)
  await sql`
    UPDATE rooms
    SET room_type = 'single', capacity = 1
    WHERE id = ANY(${singleRoomUpdates}::uuid[])
  `
}

const summary = await sql`
  SELECT room_type, COUNT(*)::int AS n
  FROM rooms WHERE is_staff = false
  GROUP BY room_type ORDER BY room_type
`
console.log('\n=== Final room breakdown (guest rooms) ===')
for (const r of summary) console.log(`  ${r.room_type}: ${r.n}`)
console.log(`\nBookings: ${bookingsToInsert.length} · Rooms used: ${filled.size} · Skipped: ${skipped.length}`)
if (skipped.length > 0) {
  console.log('\nSkipped (need manual review):')
  for (const s of skipped) console.log(`  order ${s.order} · ${s.hotel} · ${s.size}: ${s.names.join(', ')}`)
}

await sql.end()
