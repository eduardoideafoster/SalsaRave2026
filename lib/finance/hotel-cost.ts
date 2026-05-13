// Hotel cost computation per the SalsaRave 2026 contract:
//   H3 single  82 €/pp/night
//   H3 double  57 €/pp/night
//   H4 single 102 €/pp/night
//   H4 double  77 €/pp/night
// Triples/quadruples use the "double" rate; the 3rd and 4th occupants per
// night get a 15% discount.
// Guests without a room booking (RavePass only) contribute zero.

export const RATES = {
  H3: { single: 82, double: 57 },
  H4: { single: 102, double: 77 },
} as const

export const EXTRA_OCCUPANT_DISCOUNT = 0.15

export interface BookingForCost {
  room_id: string
  check_in_date: string  // YYYY-MM-DD
  check_out_date: string // YYYY-MM-DD (exclusive)
}

export interface RoomForCost {
  id: string
  hotel: 'H3' | 'H4'
  room_type: 'single' | 'double' | 'triple' | 'quadruple'
}

export interface CostBreakdown {
  total: number
  byHotel: { H3: number; H4: number }
  byRoomType: Record<RoomForCost['room_type'], number>
  nights: number
}

function* iterateNights(start: string, endExclusive: string): Generator<string> {
  const d = new Date(start + 'T00:00:00Z')
  const end = new Date(endExclusive + 'T00:00:00Z')
  while (d < end) {
    yield d.toISOString().slice(0, 10)
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

function nightlyRoomCost(
  room: RoomForCost,
  occupantsThisNight: number,
): number {
  if (occupantsThisNight === 0) return 0
  const rates = RATES[room.hotel]
  // A single room used by exactly one person uses the single rate.
  // Any other configuration uses the double rate (with discount for 3rd/4th).
  if (room.room_type === 'single' && occupantsThisNight === 1) {
    return rates.single
  }
  const base = Math.min(occupantsThisNight, 2) * rates.double
  const extra =
    Math.max(0, occupantsThisNight - 2) *
    rates.double *
    (1 - EXTRA_OCCUPANT_DISCOUNT)
  return base + extra
}

export function computeHotelCost(
  bookings: BookingForCost[],
  rooms: RoomForCost[],
): CostBreakdown {
  const roomById = new Map(rooms.map((r) => [r.id, r]))

  // Per (room_id, night) -> occupant count
  const occupancy = new Map<string, number>()
  const nightsSet = new Set<string>()

  for (const b of bookings) {
    if (!b.check_in_date || !b.check_out_date) continue
    if (b.check_out_date <= b.check_in_date) continue
    for (const night of iterateNights(b.check_in_date, b.check_out_date)) {
      nightsSet.add(night)
      const key = `${b.room_id}|${night}`
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1)
    }
  }

  const breakdown: CostBreakdown = {
    total: 0,
    byHotel: { H3: 0, H4: 0 },
    byRoomType: { single: 0, double: 0, triple: 0, quadruple: 0 },
    nights: nightsSet.size,
  }

  for (const [key, occupants] of occupancy.entries()) {
    const [roomId] = key.split('|')
    const room = roomById.get(roomId)
    if (!room) continue
    const cost = nightlyRoomCost(room, occupants)
    breakdown.total += cost
    breakdown.byHotel[room.hotel] += cost
    breakdown.byRoomType[room.room_type] += cost
  }

  return breakdown
}
