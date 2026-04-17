import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

interface Attendee {
  order_code: string
  full_name: string
  role: 'Leader' | 'Follower' | 'Both'
  country: string
  ticket_type: string
  hotel: string | null
  check_in_date: string | null
  check_out_date: string | null
}

function parseTicketType(ticket: string): { ticketType: string; hotel: string | null; checkIn: string | null; checkOut: string | null } {
  const ticketLower = ticket.toLowerCase()
  
  // RAVEPASS - no accommodation
  if (ticketLower.includes('ravepass') && !ticketLower.includes('room')) {
    return { ticketType: 'RAVEPASS', hotel: null, checkIn: null, checkOut: null }
  }
  
  // Determine hotel (UPGRADED = H4, otherwise H3)
  const hotel = ticketLower.includes('upgraded') ? 'H4' : 'H3'
  
  // Determine nights (4 nights = Sep 10-15, 3 nights = Sep 12-15)
  let checkIn: string | null = null
  let checkOut: string | null = '2026-09-15'
  
  if (ticketLower.includes('4 nights')) {
    checkIn = '2026-09-10'
  } else if (ticketLower.includes('3 nights')) {
    checkIn = '2026-09-12'
  }
  
  // Determine room type
  let ticketType = ''
  if (ticketLower.includes('single')) {
    ticketType = hotel === 'H4' ? 'UPGRADED SINGLE ROOM' : 'SINGLE ROOM'
  } else if (ticketLower.includes('double')) {
    ticketType = hotel === 'H4' ? 'UPGRADED DOUBLE ROOM' : 'DOUBLE ROOM'
  } else if (ticketLower.includes('triple')) {
    ticketType = 'TRIPLE ROOM'
  }
  
  // Add nights
  if (checkIn === '2026-09-10') {
    ticketType += ' 4 NIGHTS'
  } else if (checkIn === '2026-09-12') {
    ticketType += ' 3 NIGHTS'
  }
  
  return { ticketType, hotel, checkIn, checkOut }
}

function parseRole(role: string): 'Leader' | 'Follower' | 'Both' {
  const roleLower = role.toLowerCase().trim()
  if (roleLower === 'leader' || roleLower.includes('leader')) return 'Leader'
  if (roleLower === 'both') return 'Both'
  return 'Follower'
}

function cleanName(name: string): string {
  // Remove special annotations like (DJ Eser), (Special Triple Room), etc.
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*&\s*.*/g, '') // Remove & and everything after for split names
    .trim()
}

async function importAttendees() {
  console.log('Reading CSV file...')
  
  const csvPath = path.join(__dirname, '../user_read_only_context/text_attachments/Attendees---SalsaRave-2026-(2)-Hjpg0.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n')
  
  console.log(`Found ${lines.length} lines in CSV`)
  
  // Clear existing guests
  console.log('Clearing existing guests...')
  const { error: deleteError } = await supabase.from('guests').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) {
    console.error('Error deleting guests:', deleteError)
    return
  }
  
  const attendees: Attendee[] = []
  const seenNames = new Set<string>()
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    const parts = line.split(';')
    if (parts.length < 8) continue
    
    const [orderCode, , , , ticket, fullNameRaw, roleRaw, country] = parts
    
    // Handle names with & (multiple people on one line)
    const names = fullNameRaw.includes('&') 
      ? fullNameRaw.split('&').map(n => cleanName(n))
      : [cleanName(fullNameRaw)]
    
    for (const fullName of names) {
      if (!fullName || fullName.length < 2) continue
      
      // Skip duplicates (same name + order code)
      const key = `${orderCode}-${fullName.toLowerCase()}`
      if (seenNames.has(key)) continue
      seenNames.add(key)
      
      const role = parseRole(roleRaw)
      const { ticketType, hotel, checkIn, checkOut } = parseTicketType(ticket)
      
      attendees.push({
        order_code: orderCode,
        full_name: fullName,
        role,
        country: country?.trim() || 'Unknown',
        ticket_type: ticketType,
        hotel,
        check_in_date: checkIn,
        check_out_date: checkOut
      })
    }
  }
  
  console.log(`Parsed ${attendees.length} unique attendees`)
  
  // Insert in batches of 50
  const batchSize = 50
  for (let i = 0; i < attendees.length; i += batchSize) {
    const batch = attendees.slice(i, i + batchSize)
    const { error } = await supabase.from('guests').insert(batch)
    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
    } else {
      console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} records)`)
    }
  }
  
  // Verify count
  const { count } = await supabase.from('guests').select('*', { count: 'exact', head: true })
  console.log(`Total guests in database: ${count}`)
}

importAttendees().catch(console.error)
