// Migration:
//   1. Add is_staff BOOLEAN column to rooms (if missing).
//   2. Wipe and recreate rooms with real hotel numbers.
//      - H4: 50 rooms, floors 1-5, numbered 10..59 (floor N = N0..N9).
//      - H3: 230 rooms across 6 floors:
//          floor 1: 101..139 (39), floor 2: 201..239 (39),
//          floors 3-6: X01..X38 (38 each).
//   3. Flag known staff rooms (H4 18, 19, 51, 59) with is_staff=true and available_from=2026-09-07.
//
// Run: node --env-file=.env.local scripts/renumber_rooms_and_add_staff.mjs

import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })

console.log('1) Adding is_staff column if missing...')
await sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false`
await sql`NOTIFY pgrst, 'reload schema'`

console.log('2) Wiping rooms...')
await sql`TRUNCATE TABLE bookings, rooms RESTART IDENTITY CASCADE`

const records = []

// H4: 10..59 (floors 1-5, 10 rooms each)
for (let floor = 1; floor <= 5; floor++) {
  for (let n = 0; n <= 9; n++) {
    records.push({
      room_number: String(floor * 10 + n),
      hotel: 'H4',
      room_type: 'double',
      capacity: 2,
      available_from: '2026-09-07',
      status: 'available',
      is_staff: false,
      notes: null,
    })
  }
}

// H3: floor 1 & 2 = 39 rooms (101-139, 201-239), floors 3-6 = 38 rooms (X01-X38)
for (let floor = 1; floor <= 6; floor++) {
  const lastRoom = floor <= 2 ? 39 : 38
  for (let n = 1; n <= lastRoom; n++) {
    records.push({
      room_number: String(floor * 100 + n),
      hotel: 'H3',
      room_type: 'double',
      capacity: 2,
      available_from: '2026-09-07',
      status: 'available',
      is_staff: false,
      notes: null,
    })
  }
}

console.log(`3) Inserting ${records.length} rooms via raw SQL...`)
await sql`INSERT INTO rooms ${sql(records, 'room_number', 'hotel', 'room_type', 'capacity', 'available_from', 'status', 'is_staff', 'notes')}`

console.log('4) Flagging known staff rooms (H4 18, 19, 51, 59)...')
await sql`
  UPDATE rooms
  SET is_staff = true, available_from = '2026-09-07'
  WHERE hotel = 'H4' AND room_number IN ('18', '19', '51', '59')
`

const countByHotel = await sql`SELECT hotel, COUNT(*)::int AS n FROM rooms GROUP BY hotel ORDER BY hotel`
const staffCount = await sql`SELECT COUNT(*)::int AS n FROM rooms WHERE is_staff = true`
console.log('Done:', countByHotel, 'staff:', staffCount[0].n)

await sql.end()
