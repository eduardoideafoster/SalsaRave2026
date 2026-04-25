// Generate a self-contained INSERT block that restores any csv-canonical
// guest whose order_code is currently missing from the `guests` table.
// Safe against duplicates: WHERE NOT EXISTS guards on order_code.
//
// Run: node scripts/_gen_restore_sql.mjs > scripts/_restore_full.sql

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  const names = rawName.includes('&') ? rawName.split('&').map(cleanName) : [cleanName(rawName)]
  for (const full_name of names) {
    if (!full_name || full_name.length < 2) continue
    const key = `${order.trim()}::${full_name.toLowerCase()}`
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

const esc = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
const dateLit = (s) => (s == null ? 'NULL' : `'${s}'::date`)

const values = records
  .map(
    (r) =>
      `  (${esc(r.order_code)}, ${esc(r.full_name)}, ${esc(r.role)}, ${esc(r.country)}, ${esc(r.ticket_type)}, ${esc(r.hotel)}, ${dateLit(r.check_in_date)}, ${dateLit(r.check_out_date)})`,
  )
  .join(',\n')

console.log(`-- Restore guests whose order_code is missing entirely from the table.`)
console.log(`-- Safe against duplicates: NOT EXISTS guard on order_code.`)
console.log(`-- ${records.length} canonical records from attendees.csv.`)
console.log(``)
console.log(`WITH csv_full(order_code, full_name, role, country, ticket_type, hotel, check_in_date, check_out_date) AS (`)
console.log(`  VALUES`)
console.log(values)
console.log(`)`)
console.log(`INSERT INTO guests (order_code, full_name, role, country, ticket_type, hotel, check_in_date, check_out_date)`)
console.log(`SELECT cf.order_code, cf.full_name, cf.role, cf.country, cf.ticket_type, cf.hotel, cf.check_in_date, cf.check_out_date`)
console.log(`FROM csv_full cf`)
console.log(`WHERE NOT EXISTS (SELECT 1 FROM guests g WHERE g.order_code = cf.order_code)`)
console.log(`RETURNING order_code, full_name, ticket_type, hotel;`)
