import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { count: guestCount } = await supabase.from('guests').select('*', { count: 'exact', head: true })
const { count: roomCount } = await supabase.from('rooms').select('*', { count: 'exact', head: true })
const { count: bookingCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true })
console.log(`guests=${guestCount} rooms=${roomCount} bookings=${bookingCount}`)

const { data: guests } = await supabase.from('guests').select('hotel, ticket_type')
const byHotel = {}
const byTicket = {}
for (const g of guests || []) {
  byHotel[g.hotel ?? 'null'] = (byHotel[g.hotel ?? 'null'] || 0) + 1
  byTicket[g.ticket_type] = (byTicket[g.ticket_type] || 0) + 1
}
console.log('by hotel:', byHotel)
console.log('by ticket:', byTicket)

const { data: rooms } = await supabase.from('rooms').select('hotel, room_type, room_number').order('hotel').order('room_number')
const roomByHotel = {}
for (const r of rooms || []) roomByHotel[r.hotel] = (roomByHotel[r.hotel] || 0) + 1
console.log('rooms by hotel:', roomByHotel)
console.log('first 3 H3 rooms:', rooms?.filter(r => r.hotel === 'H3').slice(0, 3).map(r => r.room_number))
console.log('first 3 H4 rooms:', rooms?.filter(r => r.hotel === 'H4').slice(0, 3).map(r => r.room_number))
