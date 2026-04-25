// Generate a self-contained SQL block that lists which canonical guests
// (from attendees.csv) are missing from the current `guests` table. The
// output can be pasted into the Supabase SQL Editor on a phone. No env
// needed — pure local file processing.
//
// Run: node scripts/_gen_diff_sql.mjs > /tmp/diff.sql

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

const csv = readFileSync(join(__dirname, 'attendees.csv'), 'utf-8').replace(/^﻿/, '')
const lines = csv.split(/\r?\n/).slice(1).filter(Boolean)

const pairs = []
const seen = new Set()
for (const line of lines) {
  const parts = line.split(';')
  if (parts.length < 8) continue
  const [order, , , , , rawName] = parts
  const names = rawName.includes('&') ? rawName.split('&').map(cleanName) : [cleanName(rawName)]
  for (const full_name of names) {
    if (!full_name || full_name.length < 2) continue
    const key = `${order.trim()}::${full_name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push([order.trim(), full_name])
  }
}

const esc = (s) => s.replace(/'/g, "''")
const values = pairs.map(([o, n]) => `('${esc(o)}','${esc(n)}')`).join(',\n  ')

console.log(`-- Canonical CSV pairs: ${pairs.length}`)
console.log(`WITH csv_canonical(order_code, full_name) AS (`)
console.log(`  VALUES`)
console.log(`  ${values}`)
console.log(`)`)
console.log(`SELECT`)
console.log(`  cc.order_code,`)
console.log(`  cc.full_name AS csv_name,`)
console.log(`  (SELECT string_agg(g2.full_name, ' | ' ORDER BY g2.full_name)`)
console.log(`     FROM guests g2 WHERE g2.order_code = cc.order_code) AS db_names_for_order,`)
console.log(`  CASE WHEN (SELECT count(*) FROM guests g3 WHERE g3.order_code = cc.order_code) = 0`)
console.log(`       THEN 'order_missing_entirely'`)
console.log(`       ELSE 'name_mismatch_only' END AS verdict`)
console.log(`FROM csv_canonical cc`)
console.log(`LEFT JOIN guests g`)
console.log(`  ON g.order_code = cc.order_code`)
console.log(`  AND lower(g.full_name) = lower(cc.full_name)`)
console.log(`WHERE g.id IS NULL`)
console.log(`ORDER BY verdict, cc.order_code, cc.full_name;`)
