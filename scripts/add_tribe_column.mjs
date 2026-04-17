// Add a `tribe` column to the guests table so every person can be tagged
// with one of: Root Tribe · Lens Tribe · Beat Tribe · Sunset Tribe ·
// Fresh Tribe · Pulse Tribe · Spin Tribe · Core Tribe.
//
// Run: node --env-file=.env.local scripts/add_tribe_column.mjs

import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })

console.log('Adding tribe column (nullable) to guests...')
await sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS tribe TEXT`
await sql`NOTIFY pgrst, 'reload schema'`

const count = await sql`SELECT COUNT(*)::int AS n FROM guests`
console.log(`Done. guests: ${count[0].n} rows (tribe is NULL by default)`)

await sql.end()
