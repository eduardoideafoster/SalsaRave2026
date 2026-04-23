import postgres from 'postgres'
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require' })
try {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  console.log('Tables:', tables.map(t => t.table_name))
  for (const t of ['guests','rooms','bookings']) {
    try {
      const r = await sql`SELECT COUNT(*)::int AS n FROM ${sql(t)}`
      console.log(`${t}: ${r[0].n} rows`)
    } catch (e) {
      console.log(`${t}: ERROR —`, e.message)
    }
  }
  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='guests' AND table_schema='public' ORDER BY ordinal_position`
  console.log('guests columns:', cols)
} catch (e) {
  console.log('Error:', e.message)
}
await sql.end()
