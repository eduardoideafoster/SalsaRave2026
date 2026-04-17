// Mark last 5 rooms of each H3 floor as triples (capacity 3).
// Floors 1-2 end at 39: triples are X35-X39 each.
// Floors 3-6 end at 38: triples are X34-X38 each.
// 5 triples × 6 floors = 30 triples total.
//
// Run: node --env-file=.env.local scripts/mark_h3_triples.mjs

import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })

const tripleNumbers = [
  '135','136','137','138','139',
  '235','236','237','238','239',
  '334','335','336','337','338',
  '434','435','436','437','438',
  '534','535','536','537','538',
  '634','635','636','637','638',
]

const updated = await sql`
  UPDATE rooms
  SET room_type = 'triple_3beds', capacity = 3
  WHERE hotel = 'H3' AND room_number IN ${sql(tripleNumbers)}
  RETURNING room_number
`
console.log(`Updated ${updated.length} H3 rooms to triple_3beds capacity 3`)

const check = await sql`
  SELECT room_type, COUNT(*)::int AS n
  FROM rooms
  WHERE hotel = 'H3'
  GROUP BY room_type
  ORDER BY room_type
`
console.log('H3 room_type breakdown:', check)
await sql.end()
