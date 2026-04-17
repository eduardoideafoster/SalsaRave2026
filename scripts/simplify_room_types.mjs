// Simplify the room_type enum to 4 values: single, double, triple, quadruple.
// Any existing 'triple_3beds' rows become 'triple'; 'triple_double_single'
// (unused in current data) is dropped from the allowed set.
//
// Run: node --env-file=.env.local scripts/simplify_room_types.mjs

import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })

console.log('1) Dropping existing CHECK constraint...')
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

console.log('2) Migrating existing triple_3beds -> triple ...')
const migrated = await sql`
  UPDATE rooms SET room_type = 'triple' WHERE room_type = 'triple_3beds' RETURNING id
`
console.log(`   migrated ${migrated.length} rows`)

console.log('3) Adding new CHECK constraint...')
await sql`
  ALTER TABLE rooms ADD CONSTRAINT rooms_room_type_check
  CHECK (room_type IN ('single','double','triple','quadruple'))
`
await sql`NOTIFY pgrst, 'reload schema'`

const check = await sql`
  SELECT room_type, COUNT(*)::int AS n
  FROM rooms GROUP BY room_type ORDER BY room_type
`
console.log('\nFinal room_type breakdown:')
for (const r of check) console.log(`  ${r.room_type}: ${r.n}`)

await sql.end()
