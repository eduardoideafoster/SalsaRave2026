// Hotel cost, per person per night. The rate depends on how many people
// actually sleep in the room that night, not on what anyone bought: one person
// alone pays the individual rate even if the room is labelled matrimonial, and
// a single room that ends up with two in it is charged as a shared one.
//
// Guests with no room booking (RavePass only) contribute zero.

/** Per-person rate by how many share the room that night. */
export interface OccupancyRates {
  readonly 1: number
  readonly 2: number
  readonly 3: number
  readonly 4: number
}

export type HotelRates = {
  readonly H3: OccupancyRates
  readonly H4: OccupancyRates
}

/**
 * The /finance rates are quoted as a single and a shared price, with 15% off
 * the 3rd and 4th occupant. Spread across everyone in the room that is 5% off
 * a triple and 7.5% off a quadruple — exactly, not approximately — so the two
 * ways of saying it produce the same bill.
 */
const EXTRA_OCCUPANT_DISCOUNT = 0.15
const fromSharedRate = (single: number, shared: number): OccupancyRates => ({
  1: single,
  2: shared,
  3: (shared * (2 + (1 - EXTRA_OCCUPANT_DISCOUNT))) / 3,
  4: (shared * (2 + 2 * (1 - EXTRA_OCCUPANT_DISCOUNT))) / 4,
})

/** What /finance charges: H3 85/58, H4 108/83, 15% off the 3rd and 4th. */
export const RATES: HotelRates = {
  H3: fromSharedRate(85, 58),
  H4: fromSharedRate(108, 83),
}

/**
 * What /interno charges — straight off the hotel's own price list of
 * 2026-08-17, which prices a triple and a quadruple outright instead of
 * discounting the extra guests. H4 is where the two ways part company: its
 * triple and quadruple are cheaper than any percentage off the double.
 *
 * The list also shows a 25 € single supplement, which is simply the gap
 * between the shared and the individual rate (57 + 25 = 82, 77 + 25 = 102),
 * so it is already inside these numbers rather than something to add on.
 */
export const INTERNAL_RATES: HotelRates = {
  H3: { 1: 82, 2: 57, 3: 54.15, 4: 52.73 },
  H4: { 1: 102, 2: 77, 3: 67.48, 4: 62.73 },
}

export interface BookingForCost {
  room_id: string
  check_in_date: string  // YYYY-MM-DD
  check_out_date: string // YYYY-MM-DD (exclusive)
}

export interface RoomForCost {
  id: string
  hotel: 'H3' | 'H4'
  room_type: 'single' | 'double' | 'twin' | 'matrimonial' | 'triple' | 'quadruple'
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
  allRates: HotelRates,
): number {
  if (occupantsThisNight === 0) return 0
  const rates = allRates[room.hotel]
  // Rooms cannot hold more than four, but a data slip should bill at the
  // cheapest published rate rather than crash.
  const band = Math.min(occupantsThisNight, 4) as 1 | 2 | 3 | 4
  return occupantsThisNight * rates[band]
}

export function computeHotelCost(
  bookings: BookingForCost[],
  rooms: RoomForCost[],
  rates: HotelRates = RATES,
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
    byRoomType: { single: 0, double: 0, twin: 0, matrimonial: 0, triple: 0, quadruple: 0 },
    nights: nightsSet.size,
  }

  for (const [key, occupants] of occupancy.entries()) {
    const [roomId] = key.split('|')
    const room = roomById.get(roomId)
    if (!room) continue
    const cost = nightlyRoomCost(room, occupants, rates)
    breakdown.total += cost
    breakdown.byHotel[room.hotel] += cost
    breakdown.byRoomType[room.room_type] += cost
  }

  return breakdown
}
